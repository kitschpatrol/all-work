import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { CommandRun, Repository, Workspace } from '../workspace.js'
import { deleteRun, getRun, startRun, stopRun, subscribeRun } from './commands.js'
import { forgetWorkspace, getWorkspace, scanWorkspace, verifyRepository } from './repositories.js'
import { readRequest } from './request.js'

async function execute(command: string, args: string[]) {
	await new Promise<void>((resolve, reject) => {
		execFile(command, args, (error) => {
			if (error instanceof Error) {
				reject(error)
			} else {
				resolve()
			}
		})
	})
}

let temporaryDirectory: string
let workspace: Workspace
let repositories: Repository[]
const runIds: string[] = []

async function git(directory: string, args: string[]) {
	return execute('git', ['-C', directory, ...args])
}

async function createRepository(relativePath: string, commit = true) {
	const directory = path.join(temporaryDirectory, relativePath)
	await mkdir(directory, { recursive: true })
	await git(directory, ['init', '--initial-branch=main'])
	if (commit) {
		await writeFile(path.join(directory, 'readme.txt'), 'fixture\n')
		await git(directory, ['add', '.'])
		await git(directory, [
			'-c',
			'user.name=AllWork Test',
			'-c',
			'user.email=test@example.com',
			'commit',
			'-m',
			'Initial fixture',
		])
	}

	return directory
}

async function waitForRun(run: CommandRun) {
	await vi.waitFor(() => expect(run.finished).toBe(true), { interval: 20, timeout: 15_000 })
}

beforeAll(async () => {
	temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'allwork-test-'))
	const first = await createRepository('project with spaces')
	await writeFile(
		path.join(first, 'package.json'),
		JSON.stringify({
			description: 'Metascope fixture',
			name: 'example-project',
			packageManager: 'pnpm@12.11.2',
			version: '1.2.3',
		}),
	)
	await writeFile(path.join(first, 'readme.txt'), 'dirty fixture\n')
	await createRepository('group/plain-git')
	await createRepository('empty-repository', false)
	await createRepository('node_modules/ignored-repository')
	await git(first, [
		'worktree',
		'add',
		'-b',
		'worktree-test',
		path.join(temporaryDirectory, 'linked-worktree'),
	])
	await symlink(first, path.join(temporaryDirectory, 'symlinked-repository'))
	workspace = await scanWorkspace(temporaryDirectory)
	repositories = workspace.repositories
		.filter((repository) => repository.name !== 'empty-repository')
		.slice(0, 2)
}, 30_000)

afterAll(async () => {
	for (const id of runIds) {
		deleteRun(id)
	}

	await rm(temporaryDirectory, { force: true, recursive: true })
})

describe('repository discovery and Metascope metadata', () => {
	it('discovers nested Git roots, empty repositories, and worktrees without following symlinks or dependencies', () => {
		expect(workspace.repositories.map((repository) => repository.relativePath).toSorted()).toEqual([
			'empty-repository',
			'group/plain-git',
			'linked-worktree',
			'project with spaces',
		])
		expect(getWorkspace(workspace.id)).toBe(workspace)
		expect(workspace.warnings).toEqual([])
	})

	it('limits non-recursive discovery to immediate children', async () => {
		const shallow = await scanWorkspace(temporaryDirectory, false)
		expect(shallow.recursive).toBe(false)
		expect(shallow.repositories.map((repository) => repository.relativePath).toSorted()).toEqual([
			'empty-repository',
			'linked-worktree',
			'project with spaces',
		])
		forgetWorkspace(shallow.id)
	})

	it('includes the chosen repository itself when recursion is disabled', async () => {
		const shallow = await scanWorkspace(path.join(temporaryDirectory, 'group/plain-git'), false)
		expect(shallow.repositories.map((repository) => repository.relativePath)).toEqual(['.'])
		forgetWorkspace(shallow.id)
	})

	it('gets manifest metadata from Metascope and live working-tree status from Git', () => {
		const project = workspace.repositories.find(
			(repository) => repository.relativePath === 'project with spaces',
		)
		expect(project).toMatchObject({
			branch: 'main',
			changedFiles: 2,
			description: 'Metascope fixture',
			lastCommit: 'Initial fixture',
			name: 'example-project',
			packageManager: 'pnpm@12.11.2',
			version: '1.2.3',
		})
		const worktree = workspace.repositories.find(
			(repository) => repository.relativePath === 'linked-worktree',
		)
		expect(worktree).toMatchObject({ branch: 'worktree-test', changedFiles: 0 })
		const empty = workspace.repositories.find(
			(repository) => repository.relativePath === 'empty-repository',
		)
		expect(empty).toMatchObject({ branch: 'main', changedFiles: 0, lastCommitDate: '' })
	})
	it('keeps repository identifiers stable when metadata is refreshed', async () => {
		const refreshed = await scanWorkspace(temporaryDirectory)
		expect(refreshed.id).not.toBe(workspace.id)
		expect(refreshed.repositories.map((repository) => repository.id)).toEqual(
			workspace.repositories.map((repository) => repository.id),
		)
		forgetWorkspace(refreshed.id)
		expect(getWorkspace(refreshed.id)).toBeUndefined()
	})

	it('rejects a working directory that resolves through a symlink', async () => {
		const repository = repositories[0]
		if (repository === undefined) {
			throw new Error('Missing fixture repository.')
		}

		await expect(
			verifyRepository({
				...repository,
				path: path.join(temporaryDirectory, 'symlinked-repository'),
			}),
		).rejects.toThrow('Repository path changed')
	})
})

describe('parallel command runs', () => {
	it('runs with each repository as cwd and keeps stdout, stderr, and exit status per row', async () => {
		const run = startRun(
			String.raw`pwd; printf "standard output\n"; printf "standard error\n" >&2; exit 7`,
			repositories,
			2,
		)
		runIds.push(run.id)
		await waitForRun(run)
		for (const repository of repositories) {
			const result = run.results[repository.id]
			expect(result).toMatchObject({ exitCode: 7, status: 'failed' })
			expect(result?.output).toContain(repository.path)
			expect(result?.output).toContain('standard output')
			expect(result?.output).toContain('standard error')
		}

		expect(getRun(run.id)).toBe(run)
	})

	it('streams before completion and obeys the concurrency limit', async () => {
		const run = startRun('printf ready; sleep 0.3', repositories, 1)
		runIds.push(run.id)
		let observedLiveOutput = false
		const unsubscribe = subscribeRun(run.id, (event) => {
			if (
				event.type === 'result' &&
				event.result.output.includes('ready') &&
				event.result.status === 'running'
			) {
				observedLiveOutput = true
			}

			expect(
				Object.values(run.results).filter((result) => result.status === 'running').length,
			).toBeLessThanOrEqual(1)
		})
		await waitForRun(run)
		unsubscribe()
		expect(observedLiveOutput).toBe(true)
		expect(Object.values(run.results).every((result) => result.status === 'success')).toBe(true)
	})

	it('stops running commands and cancels commands that have not started', async () => {
		const run = startRun('printf started; sleep 30', repositories, 1)
		runIds.push(run.id)
		await vi.waitFor(() =>
			expect(Object.values(run.results).some((result) => result.output.includes('started'))).toBe(
				true,
			),
		)
		stopRun(run.id)
		await waitForRun(run)
		expect(Object.values(run.results).every((result) => result.status === 'cancelled')).toBe(true)
		expect(
			Object.values(run.results).filter((result) => result.output.includes('started')),
		).toHaveLength(1)
	})

	it('bounds captured output while allowing the command to finish', async () => {
		const run = startRun(
			`'${process.execPath}' -e 'process.stdout.write("x".repeat(150000))'`,
			repositories.slice(0, 1),
			1,
		)
		runIds.push(run.id)
		await waitForRun(run)
		const result = Object.values(run.results)[0]
		expect(result).toMatchObject({ status: 'success', truncated: true })
		expect(result?.output.length).toBe(128_000)
	})

	it('deletes retained output and leaves repository files untouched', async () => {
		const run = startRun('printf complete', repositories.slice(0, 1), 1)
		await waitForRun(run)
		deleteRun(run.id)
		expect(getRun(run.id)).toBeUndefined()
		expect(
			await readFile(path.join(temporaryDirectory, 'project with spaces', 'readme.txt'), 'utf8'),
		).toBe('dirty fixture\n')
	})
})

describe('local API request protection', () => {
	it('rejects requests without the application header and requests from another origin', async () => {
		const url = new URL('http://127.0.0.1:5173/api/runs')
		await expect(
			readRequest(new Request(url, { body: '{}', method: 'POST' }), url),
		).rejects.toMatchObject({ status: 403 })
		await expect(
			readRequest(
				new Request(url, {
					body: '{}',
					headers: { origin: 'https://example.com', 'X-Allwork-Request': '1' },
					method: 'POST',
				}),
				url,
			),
		).rejects.toMatchObject({ status: 403 })
		await expect(
			readRequest(
				new Request(url, {
					body: '{"command":"pwd"}',
					headers: { origin: url.origin, 'X-Allwork-Request': '1' },
					method: 'POST',
				}),
				url,
			),
		).resolves.toEqual({ command: 'pwd' })
	})
})
