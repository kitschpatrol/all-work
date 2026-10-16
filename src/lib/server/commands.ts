import type { CommandRun, Repository, RunEvent } from '#lib/workspace.js'
import { getColumnEnvironment } from '#lib/column-variables.js'
// eslint-disable-next-line depend/ban-dependencies -- Execa provides streaming, AbortSignal cancellation, and process tree termination.
import { execa } from 'execa'
import { randomUUID } from 'node:crypto'
import { stripVTControlCharacters } from 'node:util'
import { verifyRepository } from './repositories.js'
import { deleteRunCache, readRunCache, saveRunCache } from './run-cache.js'
import { userShellCommand } from './user-shell.js'

type Job = {
	cacheTimer?: ReturnType<typeof setTimeout>
	cancelled: boolean
	controller: AbortController
	deleted: boolean
	environments: Map<string, Record<string, string>>
	listeners: Set<(event: RunEvent) => void>
	run: CommandRun
}

const jobs = new Map<string, Job>()
const outputLimit = 128_000

function isCancelled(job: Job) {
	return job.cancelled
}

function emit(job: Job, event: RunEvent) {
	if (event.type === 'result' && !job.deleted) {
		job.cacheTimer ??= setTimeout(() => {
			job.cacheTimer = undefined
			if (!job.deleted) {
				void saveRunCache(job.run)
			}
		}, 500)
	}

	for (const listener of job.listeners) {
		listener(event)
	}
}

async function execute(job: Job, repository: Repository): Promise<void> {
	const result = job.run.results[repository.id]
	if (result === undefined || job.cancelled) {
		return
	}

	const started = Date.now()
	let timer: ReturnType<typeof setTimeout> | undefined
	result.status = 'running'
	emit(job, { result, type: 'result' })
	try {
		await verifyRepository(repository)
		if (isCancelled(job)) {
			return
		}

		const environment: Record<string, string | undefined> = {
			...Object.fromEntries(
				Object.entries(process.env).filter(([name]) => !name.startsWith('ALLWORK_COLUMN_')),
			),
			...job.environments.get(repository.id),
			// eslint-disable-next-line ts/naming-convention -- Git expects this exact environment variable name.
			GIT_TERMINAL_PROMPT: '0',
			// eslint-disable-next-line ts/naming-convention -- Command line tools recognize this exact environment variable name.
			NO_COLOR: '1',
		}
		delete environment.FORCE_COLOR
		const { args, file } = userShellCommand(job.run.command, repository.path)
		const child = execa(file, args, {
			all: true,
			buffer: false,
			cancelSignal: job.controller.signal,
			cwd: repository.path,
			env: environment,
			extendEnv: false,
			forceKillAfterDelay: 2000,
			killDescendants: true,
			reject: false,
			stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
		})
		const output = process.platform === 'win32' ? child.all : child.stdio[3]
		output.setEncoding('utf8').on('data', (chunk: string) => {
			if (result.truncated) {
				return
			}

			const text = stripVTControlCharacters(result.output + chunk)
			result.truncated = text.length > outputLimit
			result.output = text.slice(0, outputLimit)
			timer ??= setTimeout(() => {
				timer = undefined
				emit(job, { result, type: 'result' })
			}, 80)
		})
		const completion = await child
		result.exitCode = completion.exitCode
		result.status = isCancelled(job) ? 'cancelled' : completion.failed ? 'failed' : 'success'
		if (completion.exitCode === undefined && !isCancelled(job)) {
			result.output ||= completion.shortMessage ?? 'The shell could not start.'
		}
	} catch (error) {
		result.status = isCancelled(job) ? 'cancelled' : 'failed'
		result.output = error instanceof Error ? error.message : String(error)
	} finally {
		clearTimeout(timer)
		job.environments.delete(repository.id)
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
	sourceRuns: readonly CommandRun[] = [],
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
	const job: Job = {
		cancelled: false,
		controller: new AbortController(),
		deleted: false,
		environments: new Map(
			repositories.map((repository) => [
				repository.id,
				getColumnEnvironment(repository, sourceRuns),
			]),
		),
		listeners: new Set(),
		run,
	}
	jobs.set(run.id, job)
	void saveRunCache(run)
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
	).then(async () => {
		job.environments.clear()
		clearTimeout(job.cacheTimer)
		if (!job.deleted) {
			await saveRunCache({ ...run, finished: true })
		}

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

	job.controller.abort()
}

/** Release a run's history after stopping any remaining commands. */
export function deleteRun(id: string): void {
	const job = jobs.get(id)
	if (job !== undefined) {
		job.deleted = true
		clearTimeout(job.cacheTimer)
	}

	stopRun(id)
	jobs.delete(id)
	void deleteRunCache(id)
}

function markInterrupted(run: CommandRun) {
	for (const result of Object.values(run.results)) {
		if (result.status !== 'queued' && result.status !== 'running') {
			continue
		}

		result.status = 'cancelled'
		result.output += '\n[Interrupted when AllWork closed.]'
	}

	run.finished = true
}

/** Reattach live runs or restore cached output without rerunning shell commands. */
export async function restoreRuns(ids: string[], repositoryIds: Set<string>) {
	const restored: CommandRun[] = []
	const uniqueIds = new Set(ids)
	for (const id of uniqueIds) {
		const run = getRun(id) ?? (await readRunCache(id))
		if (
			run === undefined ||
			Object.keys(run.results).every((repositoryId) => !repositoryIds.has(repositoryId))
		) {
			continue
		}

		if (!jobs.has(id)) {
			if (!run.finished) {
				markInterrupted(run)

				await saveRunCache(run)
			}

			jobs.set(id, {
				cancelled: true,
				controller: new AbortController(),
				deleted: false,
				environments: new Map(),
				listeners: new Set(),
				run,
			})
		}

		restored.push(run)
	}

	return restored
}
