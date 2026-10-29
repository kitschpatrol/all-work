// eslint-disable-next-line depend/ban-dependencies -- Execa provides process-tree cancellation and IPC.
import type { ResultPromise } from 'execa'
import type { getMetadata } from 'metascope'
// eslint-disable-next-line depend/ban-dependencies -- Execa provides process-tree cancellation and IPC.
import { execa } from 'execa'

// Independent Node processes keep repository walking, WASM parsers, and large
// Git histories off the HTTP server's event loop. Each imports Metascope once
// and then extracts one repository at a time, since Metascope resets its
// module-wide caches at the start of every call. Options, including
// credentials, travel over IPC rather than as command-line arguments.
const scanner = `
const ready = import(process.argv[1]).then(({ getMetadata, setLogger }) => {
  // Without a logger, Metascope logs nothing and skips formatting messages.
  setLogger()
  return getMetadata
})
process.on('disconnect', () => process.exit())
process.on('message', async ({ id, options }) => {
  try {
    const getMetadata = await ready
    const data = await getMetadata(options) ?? {}
    const records = Array.isArray(data.codeStats) ? data.codeStats : [data.codeStats]
    for (const record of records) {
      if (record?.data) delete record.data.perLanguage
    }
    process.send({ data, id })
  } catch (error) {
    process.send({ error: error instanceof Error ? error.message : String(error), id })
  }
})
`

/** The JSON options a scanner process accepts over IPC. */
type Options = Pick<
	NonNullable<Parameters<typeof getMetadata>[0]>,
	'absolute' | 'credentials' | 'offline' | 'path' | 'recursive' | 'sources' | 'workspaces'
>

type Job = {
	cancel: () => void
	id: number
	options: Options
	reject: (error: Error) => void
	resolve: (data: unknown) => void
	signal?: AbortSignal
	timer?: ReturnType<typeof setTimeout>
}

const scannerOptions = {
	buffer: false,
	// eslint-disable-next-line ts/naming-convention -- Electron and Git recognize these exact environment names.
	env: { ELECTRON_RUN_AS_NODE: '1', GIT_OPTIONAL_LOCKS: '0' },
	forceKillAfterDelay: 1000,
	ipc: true,
	killDescendants: true,
	reject: false,
	serialization: 'json',
	stdio: 'ignore',
} as const

type Worker = {
	idleTimer?: ReturnType<typeof setTimeout>
	job?: Job
	/** Set once the worker is told to exit, so it takes no more jobs. */
	stopping: boolean
	subprocess: ResultPromise<typeof scannerOptions>
}

const poolSize = 4
const idleTimeout = 30_000
const jobTimeout = 120_000
const stoppedMessage = 'Metadata scanner stopped before completing.'
const queue: Job[] = []
const workers = new Set<Worker>()
let nextId = 0

function settle(job: Job, result: { data?: unknown; error?: Error }) {
	clearTimeout(job.timer)
	job.signal?.removeEventListener('abort', job.cancel)
	if (result.error === undefined) {
		job.resolve(result.data)
	} else {
		job.reject(result.error)
	}
}

function stop(worker: Worker) {
	clearTimeout(worker.idleTimer)
	worker.stopping = true
	worker.job = undefined
	worker.subprocess.kill()
}

function receive(worker: Worker, message: unknown) {
	const { job } = worker
	if (
		job === undefined ||
		typeof message !== 'object' ||
		message === null ||
		!('id' in message) ||
		message.id !== job.id
	) {
		return
	}

	worker.job = undefined
	settle(
		job,
		'error' in message && typeof message.error === 'string'
			? { error: new Error(message.error) }
			: { data: 'data' in message ? message.data : undefined },
	)
	dispatch()
}

function spawnWorker(): Worker {
	const subprocess = execa(
		process.execPath,
		['--input-type=module', '--eval', scanner, import.meta.resolve('metascope')],
		scannerOptions,
	)
	const worker: Worker = { stopping: false, subprocess }
	workers.add(worker)
	void (async () => {
		for await (const message of subprocess.getEachMessage()) {
			receive(worker, message)
		}
	})()

	void subprocess.then(() => {
		workers.delete(worker)
		clearTimeout(worker.idleTimer)
		if (worker.job !== undefined) {
			settle(worker.job, { error: new Error(stoppedMessage) })
			worker.job = undefined
		}

		dispatch()
	})
	return worker
}

async function start(worker: Worker, job: Job) {
	clearTimeout(worker.idleTimer)
	worker.idleTimer = undefined
	worker.job = job
	job.timer = setTimeout(() => {
		stop(worker)
		settle(job, { error: new Error('Metadata scan timed out.') })
	}, jobTimeout)
	try {
		await worker.subprocess.sendMessage({ id: job.id, options: job.options })
	} catch {
		// The worker exited, and its exit fails the job
	}
}

function available() {
	return [...workers].filter((worker) => !worker.stopping)
}

function dispatch() {
	while (queue.length > 0) {
		const running = available()
		const worker =
			running.find((entry) => entry.job === undefined) ??
			(running.length < poolSize ? spawnWorker() : undefined)
		if (worker === undefined) {
			return
		}

		const job = queue.shift()
		if (job !== undefined) {
			void start(worker, job)
		}
	}

	for (const worker of available()) {
		if (worker.job === undefined) {
			worker.idleTimer ??= setTimeout(() => {
				stop(worker)
			}, idleTimeout)
		}
	}
}

function cancel(job: Job) {
	const index = queue.indexOf(job)
	if (index !== -1) {
		queue.splice(index, 1)
	}

	const worker = [...workers].find((entry) => entry.job === job)
	if (worker !== undefined) {
		stop(worker)
	}

	settle(job, { error: new Error(stoppedMessage) })
}

/**
 * Extract Metascope sources in a pooled scanner process. Cancelling a running
 * extraction stops its process, and later extractions start a fresh one.
 */
export async function extractMetadata(
	options: Options,
	cancelSignal?: AbortSignal,
): Promise<unknown> {
	if (cancelSignal?.aborted === true) {
		throw new Error(stoppedMessage)
	}

	return new Promise((resolve, reject) => {
		const job: Job = {
			cancel() {
				cancel(job)
			},
			id: nextId++,
			options,
			reject,
			resolve,
			signal: cancelSignal,
		}
		cancelSignal?.addEventListener('abort', job.cancel, { once: true })
		queue.push(job)
		dispatch()
	})
}

/** Stop every scanner process, failing any extraction still running. */
export function stopMetadataWorkers() {
	for (const job of queue.splice(0)) {
		settle(job, { error: new Error(stoppedMessage) })
	}

	for (const worker of workers) {
		const { job } = worker
		stop(worker)
		if (job !== undefined) {
			settle(job, { error: new Error(stoppedMessage) })
		}
	}
}
