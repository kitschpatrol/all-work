import type { CommandRun, Repository, RunEvent } from '#lib/workspace.js'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { stripVTControlCharacters } from 'node:util'
import { verifyRepository } from './repositories.js'

type Job = {
	cancelled: boolean
	children: Set<ChildProcess>
	listeners: Set<(event: RunEvent) => void>
	run: CommandRun
}

const jobs = new Map<string, Job>()
const outputLimit = 128_000

function isCancelled(job: Job) {
	return job.cancelled
}

function emit(job: Job, event: RunEvent) {
	for (const listener of job.listeners) {
		listener(event)
	}
}

function terminate(child: ChildProcess) {
	try {
		if (process.platform !== 'win32' && child.pid !== undefined) {
			process.kill(-child.pid, 'SIGTERM')
		} else {
			child.kill('SIGTERM')
		}
	} catch {
		// The command may have exited between the request and the signal.
	}

	const timer = setTimeout(() => {
		try {
			if (process.platform !== 'win32' && child.pid !== undefined) {
				process.kill(-child.pid, 'SIGKILL')
			} else {
				child.kill('SIGKILL')
			}
		} catch {
			// The process group has already exited.
		}
	}, 2000)
	timer.unref()
}

async function execute(job: Job, repository: Repository): Promise<void> {
	const result = job.run.results[repository.id]
	if (result === undefined || job.cancelled) {
		return
	}

	const started = Date.now()
	result.status = 'running'
	emit(job, { result, type: 'result' })
	try {
		await verifyRepository(repository)
		if (isCancelled(job)) {
			return
		}

		await new Promise<void>((resolve) => {
			const shell =
				process.platform === 'win32'
					? (process.env.ComSpec ?? 'cmd.exe')
					: (process.env.SHELL ?? '/bin/sh')
			const args =
				process.platform === 'win32'
					? ['/d', '/s', '/c', job.run.command]
					: ['-lc', job.run.command]
			const environment: Record<string, string | undefined> = {
				...process.env,
				// eslint-disable-next-line ts/naming-convention -- Git expects this exact environment variable name.
				GIT_TERMINAL_PROMPT: '0',
				// eslint-disable-next-line ts/naming-convention -- Command line tools recognize this exact environment variable name.
				NO_COLOR: '1',
				// eslint-disable-next-line ts/naming-convention -- Shell environment variables use their native uppercase names.
				TERM: 'dumb',
			}
			delete environment.FORCE_COLOR
			const child = spawn(shell, args, {
				cwd: repository.path,
				detached: process.platform !== 'win32',
				env: environment,
				stdio: ['ignore', 'pipe', 'pipe'],
			})
			job.children.add(child)
			let timer: ReturnType<typeof setTimeout> | undefined
			function flush() {
				clearTimeout(timer)
				timer = undefined
				if (result !== undefined) {
					emit(job, { result, type: 'result' })
				}
			}

			function append(chunk: string) {
				if (result === undefined || result.truncated) {
					return
				}

				const output = stripVTControlCharacters(result.output + chunk)
				result.truncated = output.length > outputLimit
				result.output = output.slice(0, outputLimit)
				timer ??= setTimeout(flush, 80)
			}

			child.stdout.setEncoding('utf8').on('data', append)
			child.stderr.setEncoding('utf8').on('data', append)
			child.on('error', (error) => {
				append(error.message)
			})
			child.on('close', (code) => {
				job.children.delete(child)
				result.exitCode = code ?? undefined
				result.duration = Date.now() - started
				result.status = job.cancelled ? 'cancelled' : code === 0 ? 'success' : 'failed'
				flush()
				resolve()
			})
		})
	} catch (error) {
		result.status = isCancelled(job) ? 'cancelled' : 'failed'
		result.output = error instanceof Error ? error.message : String(error)
		result.duration = Date.now() - started
		emit(job, { result, type: 'result' })
	}
}

/**
 * Start a bounded parallel shell run, keeping each repository's output
 * independent.
 */
export function startRun(
	command: string,
	repositories: Repository[],
	concurrency: number,
): CommandRun {
	const run: CommandRun = {
		command,
		concurrency,
		createdAt: new Date().toISOString(),
		finished: false,
		id: randomUUID(),
		results: Object.fromEntries(
			repositories.map((repository) => [
				repository.id,
				{
					output: '',
					repositoryId: repository.id,
					status: 'queued',
					truncated: false,
				},
			]),
		),
	}
	const job: Job = { cancelled: false, children: new Set(), listeners: new Set(), run }
	jobs.set(run.id, job)
	let next = 0
	void Promise.all(
		Array.from({ length: Math.min(concurrency, repositories.length) }, async () => {
			while (!job.cancelled && next < repositories.length) {
				const repository = repositories[next++]
				if (repository !== undefined) {
					await execute(job, repository)
				}
			}
		}),
	).then(() => {
		run.finished = true
		emit(job, { type: 'finished' })
	})
	return run
}

/** Get a command run by its opaque identifier. */
export function getRun(id: string): CommandRun | undefined {
	return jobs.get(id)?.run
}

/** Subscribe to live output, including a snapshot for reconnecting clients. */
export function subscribeRun(id: string, listener: (event: RunEvent) => void): () => void {
	const job = jobs.get(id)
	if (job === undefined) {
		throw new Error('Run not found.')
	}

	listener({ run: job.run, type: 'snapshot' })
	if (job.run.finished) {
		listener({ type: 'finished' })
	} else {
		job.listeners.add(listener)
	}

	return () => {
		job.listeners.delete(listener)
	}
}

/** Cancel queued commands and terminate running shell process groups. */
export function stopRun(id: string): void {
	const job = jobs.get(id)
	if (job === undefined || job.run.finished) {
		return
	}

	job.cancelled = true
	for (const result of Object.values(job.run.results)) {
		if (result.status !== 'queued' && result.status !== 'running') {
			continue
		}

		result.status = 'cancelled'
		emit(job, { result, type: 'result' })
	}

	for (const child of job.children) {
		terminate(child)
	}
}

/** Release a run's history after stopping any remaining commands. */
export function deleteRun(id: string): void {
	stopRun(id)
	jobs.delete(id)
}
