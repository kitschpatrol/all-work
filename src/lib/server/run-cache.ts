import type { CommandRun } from '#lib/workspace.js'
import { asRecord } from '#lib/preferences.js'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cacheDirectory } from './cache.js'

const runIdPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iv
const writes = new Map<string, Promise<void>>()

/** Whether a value can be a run's number: a whole number from 1. */
export function isRunNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

function cachePath(id: string) {
	return path.join(cacheDirectory('runs'), `${id}.json`)
}

async function writeSnapshot(id: string, text: string, previous?: Promise<void>) {
	await previous
	try {
		const file = cachePath(id)
		const temporaryFile = `${file}.${process.pid}.tmp`
		await mkdir(cacheDirectory('runs'), { mode: 0o700, recursive: true })
		await writeFile(temporaryFile, text, { mode: 0o600 })
		await rename(temporaryFile, file)
	} catch {
		// Live output remains usable when the local cache is unavailable.
	}
}

/**
 * Serialize writes for each run so checkpoints cannot overwrite completed
 * output.
 */
export async function saveRunCache(run: CommandRun) {
	const next = writeSnapshot(run.id, JSON.stringify(run), writes.get(run.id))
	writes.set(run.id, next)
	await next
	if (writes.get(run.id) === next) {
		writes.delete(run.id)
	}
}

type CommandResult = CommandRun['results'][string]

function parseResult(repositoryId: string, raw: unknown): CommandResult | undefined {
	const result = asRecord(raw)
	if (
		result?.repositoryId !== repositoryId ||
		typeof result.output !== 'string' ||
		typeof result.truncated !== 'boolean' ||
		typeof result.status !== 'string' ||
		!['cancelled', 'failed', 'queued', 'running', 'success'].includes(result.status)
	) {
		return undefined
	}

	return {
		command: typeof result.command === 'string' ? result.command : undefined,
		duration: typeof result.duration === 'number' ? result.duration : undefined,
		exitCode: typeof result.exitCode === 'number' ? result.exitCode : undefined,
		output: result.output,
		repositoryId,
		status: result.status as CommandResult['status'],
		truncated: result.truncated,
	}
}

/** Restore output as data; cached commands are never executed. */
export async function readRunCache(id: string): Promise<CommandRun | undefined> {
	if (!runIdPattern.test(id)) {
		return undefined
	}

	try {
		const value = asRecord(JSON.parse(await readFile(cachePath(id), 'utf8')) as unknown)
		if (
			value?.id !== id ||
			typeof value.command !== 'string' ||
			typeof value.createdAt !== 'string' ||
			typeof value.finished !== 'boolean' ||
			typeof value.concurrency !== 'number' ||
			!isRunNumber(value.number)
		) {
			return undefined
		}

		const results: CommandRun['results'] = {}
		const entries = Object.entries(asRecord(value.results) ?? {})
		for (const [repositoryId, raw] of entries) {
			const result = parseResult(repositoryId, raw)
			if (result === undefined) {
				return undefined
			}

			results[repositoryId] = result
		}

		return {
			command: value.command,
			concurrency: value.concurrency,
			createdAt: value.createdAt,
			finished: value.finished,
			id,
			number: value.number,
			results,
		}
	} catch {
		return undefined
	}
}

/** Wait for outstanding writes before removing a cleared output column. */
export async function deleteRunCache(id: string) {
	if (!runIdPattern.test(id)) {
		return
	}

	await writes.get(id)
	try {
		await unlink(cachePath(id))
	} catch {
		// Missing or unavailable output caches do not prevent clearing a column.
	}
}
