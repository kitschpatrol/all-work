import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
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
const hasZsh = existsSync('/bin/zsh')
const fixtureShell = hasZsh ? '/bin/zsh' : '/bin/sh'
const syntaxErrorPattern = /syntax error|parse error/iv
const descendantPidPattern = /stubborn=(\d+)/v

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
	vi.stubEnv('SHELL', fixtureShell)
	vi.stubEnv('ALLWORK_CACHE_DIRECTORY', path.join(temporaryDirectory, '.metadata-cache'))
	if (hasZsh) {
		const shellDirectory = path.join(temporaryDirectory, '.shell-config')
		const binDirectory = path.join(shellDirectory, 'bin')
		await mkdir(binDirectory, { recursive: true })
		vi.stubEnv('ZDOTDIR', shellDirectory)
		await writeFile(
			path.join(shellDirectory, '.zprofile'),
			'export ALLWORK_SHELL_PROFILE="login configuration loaded"\n',
		)
		await writeFile(
			path.join(shellDirectory, '.zshrc'),
			[
				'export PATH="$ZDOTDIR/bin:$PATH"',
				String.raw`alias allwork_fixture_alias='printf "alias works\n"'`,
				String.raw`allwork_fixture_function() { printf "function works\n"; }`,
				String.raw`printf "startup stdout\n"`,
				String.raw`printf "startup stderr\n" >&2`,
				'cd "$ZDOTDIR"',
			].join('\n'),
		)
		await writeFile(
			path.join(binDirectory, 'allwork-fixture-tool'),
			'#!/bin/sh\nprintf "path works\\n"\n',
			{ mode: 0o755 },
		)
	}

	const first = await createRepository('project with spaces')
	await git(first, ['remote', 'add', 'origin', 'git@github.com:fixture-owner/git-project.git'])
	await writeFile(
		path.join(first, 'package.json'),
		JSON.stringify({
			description: 'Metascope fixture',
			name: 'example-project',
			packageManager: 'pnpm@12.11.2',
			repository: 'https://github.com/manifest-owner/manifest-project.git',
			version: '1.2.3',
		}),
	)
	await writeFile(path.join(first, 'readme.txt'), 'dirty fixture\n')
	const nested = await createRepository('group/plain-git')
	await git(nested, ['remote', 'add', 'origin', 'https://gitlab.com/team/subgroup/plain-git.git'])
	await git(nested, ['remote', 'add', 'backup', 'https://gitlab.com/team/backup.git'])
	await git(nested, ['update-ref', 'refs/remotes/origin/main', 'HEAD'])
	await git(nested, ['update-ref', 'refs/remotes/backup/main', 'HEAD'])
	await git(nested, [
		'-c',
		'user.name=AllWork Test',
		'-c',
		'user.email=test@example.com',
		'commit',
		'--allow-empty',
		'-m',
		'Ahead of cached remotes',
	])
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
	await vi.waitFor(
		() => {
			if (
				workspace.repositories.some(
					(repository) => repository.metadata?.groups.git?.status !== 'ready',
				)
			) {
				throw new Error(
					JSON.stringify(
						workspace.repositories.map((repository) => ({
							groups: repository.metadata?.groups,
							path: repository.relativePath,
						})),
					),
				)
			}
		},
		{ timeout: 15_000 },
	)
	repositories = workspace.repositories
		.filter((repository) => repository.name !== 'empty-repository')
		.slice(0, 2)
}, 30_000)

afterAll(async () => {
	for (const id of runIds) {
		deleteRun(id)
	}

	forgetWorkspace(workspace.id)
	await rm(temporaryDirectory, { force: true, recursive: true })
	vi.unstubAllEnvs()
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

	it('gets project metadata and live Git statistics through the Metascope template', () => {
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
			repoName: 'git-project',
			repoOwner: 'fixture-owner',
			version: '1.2.3',
		})
		const worktree = workspace.repositories.find(
			(repository) => repository.relativePath === 'linked-worktree',
		)
		expect(worktree).toMatchObject({
			branch: 'worktree-test',
			changedFiles: 0,
			remote: 'git@github.com:fixture-owner/git-project.git',
			repoName: 'git-project',
			repoOwner: 'fixture-owner',
		})
		const empty = workspace.repositories.find(
			(repository) => repository.relativePath === 'empty-repository',
		)
		expect(empty).toMatchObject({ branch: 'main', changedFiles: 0, lastCommitDate: '' })
		expect(empty).toMatchObject({ repoName: 'empty-repository', repoOwner: '' })
		expect(
			workspace.repositories.find((repository) => repository.relativePath === 'group/plain-git'),
		).toMatchObject({ repoName: 'plain-git', repoOwner: 'team/subgroup' })
	})

	it('records each repository readme from the discovery listing', () => {
		const readmes = Object.fromEntries(
			workspace.repositories.map((repository) => [repository.relativePath, repository.readme]),
		)
		expect(readmes).toMatchObject({
			'empty-repository': '',
			'group/plain-git': 'readme.txt',
			'project with spaces': 'readme.txt',
		})
	})

	it('uses Metascope totals across cached remotes, including without a configured upstream', () => {
		const repository = workspace.repositories.find(
			(candidate) => candidate.relativePath === 'group/plain-git',
		)
		expect(repository).toMatchObject({
			ahead: 2,
			behind: 0,
			branch: 'main',
			changedFiles: 0,
			gitStatusAvailable: true,
		})
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
	it('exports separate row values to commands and child processes as literal data', async () => {
		const selected = repositories.map((repository, index) => ({
			...repository,
			branch: `branch-${index}`,
			name: `${index}: project "quotes" $(printf injected); literal\nsecond line`,
		}))
		const inherited = process.env.ALLWORK_COLUMN_STALE
		vi.stubEnv('ALLWORK_COLUMN_STALE', 'must not leak')
		try {
			const run = startRun(
				`'${process.execPath}' -e 'process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith("ALLWORK_COLUMN_")))))'`,
				selected,
				2,
			)
			runIds.push(run.id)
			await waitForRun(run)
			for (const repository of selected) {
				const result = run.results[repository.id]
				expect(result?.status).toBe('success')
				const environment: unknown = JSON.parse(result?.output ?? '{}')
				expect(environment).toMatchObject(
					Object.fromEntries([
						['ALLWORK_COLUMN_REPOSITORY', repository.relativePath],
						['ALLWORK_COLUMN_REPO_NAME', repository.repoName],
						['ALLWORK_COLUMN_REPO_OWNER', repository.repoOwner],
						['ALLWORK_COLUMN_NAME', repository.name],
						['ALLWORK_COLUMN_DESCRIPTION', repository.description],
						['ALLWORK_COLUMN_BRANCH', repository.branch],
						['ALLWORK_COLUMN_WORKING_TREE', String(repository.changedFiles)],
						['ALLWORK_COLUMN_SYNC', String(repository.ahead + repository.behind)],
						['ALLWORK_COLUMN_LAST_COMMIT', repository.lastCommitDate],
						['ALLWORK_COLUMN_VERSION', repository.version],
						['ALLWORK_COLUMN_PACKAGE_MANAGER', repository.packageManager],
						['ALLWORK_COLUMN_REMOTE', repository.remote],
					]),
				)
			}
		} finally {
			vi.stubEnv('ALLWORK_COLUMN_STALE', inherited)
		}
	})

	it('snapshots output variables before queueing and preserves them after the source run is deleted', async () => {
		const source = startRun(String.raw`printf '%s\n' "$ALLWORK_COLUMN_REPOSITORY"`, repositories, 2)
		runIds.push(source.id)
		await waitForRun(source)
		const run = startRun('printf \'%s\' "$ALLWORK_COLUMN_RUN_1"; sleep 0.2', repositories, 1, [
			source,
		])
		runIds.push(run.id)
		for (const result of Object.values(source.results)) {
			result.output = 'changed after submission'
		}

		deleteRun(source.id)
		await waitForRun(run)
		for (const repository of repositories) {
			expect(run.results[repository.id]).toMatchObject({
				output: `${repository.relativePath}\n`,
				status: 'success',
			})
		}
	})

	it.skipIf(!hasZsh)(
		'loads login and interactive configuration, aliases, functions, and PATH without startup chatter',
		async () => {
			const run = startRun(
				String.raw`allwork_fixture_alias; allwork_fixture_function; allwork-fixture-tool; printf '%s\n' "$ALLWORK_SHELL_PROFILE"; pwd`,
				repositories,
				2,
			)
			runIds.push(run.id)
			await waitForRun(run)
			for (const repository of repositories) {
				expect(run.results[repository.id]).toMatchObject({
					exitCode: 0,
					output: `alias works\nfunction works\npath works\nlogin configuration loaded\n${repository.path}\n`,
					status: 'success',
				})
			}
		},
	)

	it.skipIf(!hasZsh || os.userInfo().shell !== '/bin/zsh')(
		'uses the account login shell when a desktop launch does not inherit SHELL',
		async () => {
			vi.stubEnv('SHELL', undefined)
			try {
				const run = startRun('allwork_fixture_alias', repositories.slice(0, 1), 1)
				runIds.push(run.id)
				await waitForRun(run)
				expect(Object.values(run.results)[0]).toMatchObject({
					output: 'alias works\n',
					status: 'success',
				})
			} finally {
				vi.stubEnv('SHELL', fixtureShell)
			}
		},
	)

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

	it('preserves shell operators, quoting, and Unicode output', async () => {
		const run = startRun(
			String.raw`printf '%s\n' 'café $HOME "quotes"' | cat && printf '%s\n' '日本語' >&2`,
			repositories.slice(0, 1),
			1,
		)
		runIds.push(run.id)
		await waitForRun(run)
		expect(Object.values(run.results)[0]).toMatchObject({
			output: 'café $HOME "quotes"\n日本語\n',
			status: 'success',
		})
	})

	it('reports command syntax errors in the output', async () => {
		const run = startRun('if then', repositories.slice(0, 1), 1)
		runIds.push(run.id)
		await waitForRun(run)
		const result = Object.values(run.results)[0]
		expect(result?.status).toBe('failed')
		expect(result?.output).toMatch(syntaxErrorPattern)
	})

	it('keeps internal runner arguments out of the command positional parameters', async () => {
		const run = startRun(String.raw`printf '%s\n' "$#:$1:$2"`, repositories.slice(0, 1), 1)
		runIds.push(run.id)
		await waitForRun(run)
		expect(Object.values(run.results)[0]).toMatchObject({
			output: '0::\n',
			status: 'success',
		})
	})

	it('reports an unavailable user shell and finishes the run', async () => {
		vi.stubEnv('SHELL', path.join(temporaryDirectory, 'missing-shell'))
		try {
			const run = startRun('pwd', repositories.slice(0, 1), 1)
			runIds.push(run.id)
			await waitForRun(run)
			const result = Object.values(run.results)[0]
			expect(result?.status).toBe('failed')
			expect(result?.output).toContain('ENOENT')
		} finally {
			vi.stubEnv('SHELL', fixtureShell)
		}
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

	it('forcefully stops descendant processes that ignore termination signals', async () => {
		const run = startRun(
			`'${process.execPath}' -e 'process.on("SIGTERM", () => {}); process.on("SIGHUP", () => {}); console.log("stubborn=" + process.pid); setInterval(() => {}, 1000)' & wait`,
			repositories.slice(0, 1),
			1,
		)
		runIds.push(run.id)
		await vi.waitFor(() =>
			expect(Object.values(run.results)[0]?.output).toMatch(descendantPidPattern),
		)
		const pid = Number(Object.values(run.results)[0]?.output.match(descendantPidPattern)?.[1])
		stopRun(run.id)
		await waitForRun(run)
		expect(Object.values(run.results)[0]?.status).toBe('cancelled')
		await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow(), { timeout: 3000 })
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
