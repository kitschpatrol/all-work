import { randomUUID } from 'node:crypto'
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandRun } from '../workspace.js'
import { cacheDirectory, clearMetadataCache } from './cache.js'
import { deleteRun, getRun, restoreRuns } from './commands.js'
import { deleteRunCache, readRunCache, saveRunCache } from './run-cache.js'

let temporaryDirectory: string
const runIds: string[] = []

function fixture(finished = true): CommandRun {
	const id = randomUUID()
	runIds.push(id)
	return {
		command: `touch '${temporaryDirectory}/should-not-run'`,
		concurrency: 1,
		createdAt: new Date().toISOString(),
		finished,
		id,
		results: {
			fixture: {
				output: 'cached output',
				repositoryId: 'fixture',
				status: finished ? 'success' : 'running',
				truncated: false,
			},
		},
	}
}

beforeEach(async () => {
	temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'allwork-run-cache-'))
	vi.stubEnv('ALLWORK_CACHE_DIRECTORY', temporaryDirectory)
})

afterEach(async () => {
	for (const id of runIds.splice(0)) {
		deleteRun(id)
		await deleteRunCache(id)
	}

	await rm(temporaryDirectory, { force: true, recursive: true })
	vi.unstubAllEnvs()
})

describe('persistent command output', () => {
	it('serializes checkpoints and restores completed runs as data without executing commands', async () => {
		const run = fixture()
		await Promise.all([saveRunCache({ ...run, finished: false }), saveRunCache(run)])
		expect(await readRunCache(run.id)).toEqual(run)
		expect(await restoreRuns([run.id, run.id], new Set(['fixture']))).toEqual([run])
		expect(getRun(run.id)).toEqual(run)
		await expect(access(path.join(temporaryDirectory, 'should-not-run'))).rejects.toThrow()
	})

	it('marks interrupted cached jobs as cancelled without rerunning them', async () => {
		const run = fixture(false)
		await saveRunCache(run)
		const restored = await restoreRuns([run.id], new Set(['fixture']))
		expect(restored[0]).toMatchObject({
			finished: true,
			results: {
				fixture: {
					output: 'cached output\n[Interrupted when AllWork closed.]',
					status: 'cancelled',
				},
			},
		})
		expect(await readRunCache(run.id)).toEqual(restored[0])
		await expect(access(path.join(temporaryDirectory, 'should-not-run'))).rejects.toThrow()
	})

	it('ignores foreign workspaces and invalid paths, and deletes after pending writes', async () => {
		const run = fixture()
		await saveRunCache(run)
		expect(await restoreRuns([run.id], new Set(['other']))).toEqual([])
		expect(await readRunCache('../outside')).toBeUndefined()
		const pending = saveRunCache(run)
		await deleteRunCache(run.id)
		await pending
		expect(await readRunCache(run.id)).toBeUndefined()
	})

	it('clears metadata separately from command outputs and unrelated files', async () => {
		const run = fixture()
		await saveRunCache(run)
		await writeFile(path.join(temporaryDirectory, `${'a'.repeat(64)}.json`), '{}')
		await writeFile(path.join(temporaryDirectory, 'keep.txt'), 'keep')
		await mkdir(path.join(temporaryDirectory, 'keep-directory'))
		expect(await clearMetadataCache()).toBe(1)
		expect(await readdir(cacheDirectory('metadata'))).toEqual([
			'keep-directory',
			'keep.txt',
			'runs',
		])
		expect(await readRunCache(run.id)).toEqual(run)
	})
})
