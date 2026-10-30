import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
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
const isWindows = process.platform === 'win32'
const hasZsh = existsSync('/bin/zsh')
const fixtureShell = hasZsh ? '/bin/zsh' : '/bin/sh'
const shellVariable = isWindows ? 'ComSpec' : 'SHELL'
const configuredShell = isWindows ? process.env.ComSpec : fixtureShell
const syntaxErrorPattern = /syntax error|parse error|syntax of the command/iv
const descendantPidPattern = /stubborn=(\d+)/v

/**
 * A command that runs the same way under POSIX shells and cmd.exe. The script
 * may contain single quotes but no double quotes, backslashes, or dollar signs,
 * since each shell treats those differently.
 */
function nodeCommand(script: string) {
	return `"${process.execPath}" -e "${script}"`
}

async function removeDirectory(directory: string) {
	// Windows reports EBUSY while a Git process that just finished still holds the directory
	await rm(directory, { force: true, maxRetries: 10, recursive: true })
}

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
			'user.name=All Work Test',
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
	temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'all-work-test-'))
	vi.stubEnv('SHELL', fixtureShell)
	vi.stubEnv('ALL_WORK_CACHE_DIRECTORY', path.join(temporaryDirectory, '.metadata-cache'))
	if (hasZsh) {
		const shellDirectory = path.join(temporaryDirectory, '.shell-config')
		const binDirectory = path.join(shellDirectory, 'bin')
		await mkdir(binDirectory, { recursive: true })
		vi.stubEnv('ZDOTDIR', shellDirectory)
		await writeFile(
			path.join(shellDirectory, '.zprofile'),
			'export ALL_WORK_SHELL_PROFILE="login configuration loaded"\n',
		)
		await writeFile(
			path.join(shellDirectory, '.zshrc'),
			[
				'export PATH="$ZDOTDIR/bin:$PATH"',
				String.raw`alias all_work_fixture_alias='printf "alias works\n"'`,
				String.raw`all_work_fixture_function() { printf "function works\n"; }`,
				String.raw`printf "startup stdout\n"`,
				String.raw`printf "startup stderr\n" >&2`,
				'cd "$ZDOTDIR"',
			].join('\n'),
		)
		await writeFile(
			path.join(binDirectory, 'all-work-fixture-tool'),
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
	await git(nested, ['branch', '--set-upstream-to=origin/main'])
	await git(nested, [
		'-c',
		'user.name=All Work Test',
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
	await git(first, ['config', 'branch.worktree-test.remote', 'origin'])
	await git(first, ['config', 'branch.worktree-test.merge', 'refs/heads/deleted'])
	await symlink(first, path.join(temporaryDirectory, 'symlinked-repository'))
	workspace = await scanWorkspace(temporaryDirectory, true)
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
	await removeDirectory(temporaryDirectory)
	vi.unstubAllEnvs()
})

describe('repository discovery and Metascope metadata', () => {
	it('discovers nested Git roots, empty repositories, and worktrees without symlinked duplicates or dependencies', () => {
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

	it('follows symlinks only to repositories, listing them by link name and running in the target', async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'all-work-links-'))
		const elsewhere = await mkdtemp(path.join(os.tmpdir(), 'all-work-elsewhere-'))
		try {
			const target = path.join(elsewhere, 'target')
			await mkdir(path.join(target, 'nested'), { recursive: true })
			await git(target, ['init', '--initial-branch=main'])
			await git(path.join(target, 'nested'), ['init', '--initial-branch=main'])
			await symlink(target, path.join(target, 'cycle'))
			await mkdir(path.join(elsewhere, 'plain/hidden'), { recursive: true })
			await git(path.join(elsewhere, 'plain/hidden'), ['init', '--initial-branch=main'])
			await writeFile(path.join(elsewhere, 'notes.txt'), 'not a repository\n')

			const direct = path.join(root, 'direct')
			await mkdir(direct)
			await git(direct, ['init', '--initial-branch=main'])
			await symlink(direct, path.join(root, 'alias'))
			await symlink(target, path.join(root, 'linked'))
			await symlink(path.join(elsewhere, 'plain'), path.join(root, 'plain-folder'))
			await symlink(path.join(elsewhere, 'notes.txt'), path.join(root, 'notes'))
			await symlink(path.join(elsewhere, 'missing'), path.join(root, 'broken'))

			const realTarget = await realpath(target)
			const scanned = await scanWorkspace(root, true)
			expect(scanned.warnings).toEqual([])
			expect(
				scanned.repositories.map(({ name, path: directory, relativePath }) => ({
					directory,
					name,
					relativePath,
				})),
			).toEqual([
				{ directory: await realpath(direct), name: 'direct', relativePath: 'direct' },
				{ directory: realTarget, name: 'linked', relativePath: 'linked' },
				{
					directory: path.join(realTarget, 'nested'),
					name: 'nested',
					relativePath: 'linked/nested',
				},
			])
			const linked = scanned.repositories[1]
			if (linked === undefined) {
				throw new Error('Missing linked repository.')
			}

			await expect(verifyRepository(linked)).resolves.toBeUndefined()
			forgetWorkspace(scanned.id)

			const shallow = await scanWorkspace(root, false)
			expect(shallow.repositories.map((repository) => repository.relativePath)).toEqual([
				'direct',
				'linked',
			])
			forgetWorkspace(shallow.id)
		} finally {
			await removeDirectory(root)
			await removeDirectory(elsewhere)
		}
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

	it('compares with the tracked upstream only, keeping totals across remotes as metadata', () => {
		const repository = workspace.repositories.find(
			(candidate) => candidate.relativePath === 'group/plain-git',
		)
		expect(repository).toMatchObject({
			ahead: 1,
			behind: 0,
			branch: 'main',
			changedFiles: 0,
			gitStatusAvailable: true,
			upstream: 'origin/main',
			upstreamGone: false,
		})
		expect(repository?.metadata?.values).toMatchObject({
			'Git Remotes Ahead': 2,
			'Git Remotes Behind': 0,
		})
	})

	it('flags an upstream whose ref is missing locally, and repositories without one', () => {
		const byPath = (relativePath: string) =>
			workspace.repositories.find((candidate) => candidate.relativePath === relativePath)
		expect(byPath('linked-worktree')).toMatchObject({
			ahead: 0,
			behind: 0,
			upstream: 'origin/deleted',
			upstreamGone: true,
		})
		expect(byPath('project with spaces')).toMatchObject({ upstream: '', upstreamGone: false })
	})
	it('keeps repository identifiers stable when metadata is refreshed', async () => {
		const refreshed = await scanWorkspace(temporaryDirectory, true)
		expect(refreshed.id).not.toBe(workspace.id)
		expect(refreshed.repositories.map((repository) => repository.id)).toEqual(
			workspace.repositories.map((repository) => repository.id),
		)
		forgetWorkspace(refreshed.id)
		expect(getWorkspace(refreshed.id)).toBeUndefined()
	})

	it('scans again with cached names and branches already applied', async () => {
		const refreshed = await scanWorkspace(temporaryDirectory, true)
		try {
			expect(
				refreshed.repositories.find(
					(repository) => repository.relativePath === 'project with spaces',
				),
			).toMatchObject({ branch: 'main', name: 'example-project', version: '1.2.3' })
		} finally {
			forgetWorkspace(refreshed.id)
		}
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
	const longRunningCommand = nodeCommand("console.log('started'); setTimeout(() => {}, 30_000)")

	it('exports separate row values to commands and child processes as literal data', async () => {
		const selected = repositories.map((repository, index) => ({
			...repository,
			branch: `branch-${index}`,
			name: `${index}: project "quotes" $(printf injected); literal\nsecond line`,
		}))
		const inherited = process.env.ALL_WORK_COLUMN_STALE
		vi.stubEnv('ALL_WORK_COLUMN_STALE', 'must not leak')
		try {
			const run = startRun(
				nodeCommand(
					"process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith('ALL_WORK_COLUMN_')))))",
				),
				selected,
				2,
				1,
			)
			runIds.push(run.id)
			await waitForRun(run)
			for (const repository of selected) {
				const result = run.results[repository.id]
				expect(result?.status).toBe('success')
				expect(result?.command).toBeUndefined()
				const environment: unknown = JSON.parse(result?.output ?? '{}')
				expect(environment).toMatchObject(
					Object.fromEntries([
						['ALL_WORK_COLUMN_REPOSITORY', repository.relativePath],
						['ALL_WORK_COLUMN_REPO_NAME', repository.repoName],
						['ALL_WORK_COLUMN_REPO_OWNER', repository.repoOwner],
						['ALL_WORK_COLUMN_NAME', repository.name],
						['ALL_WORK_COLUMN_DESCRIPTION', repository.description],
						['ALL_WORK_COLUMN_BRANCH', repository.branch],
						['ALL_WORK_COLUMN_WORKING_TREE', String(repository.changedFiles)],
						[
							'ALL_WORK_COLUMN_SYNC',
							repository.upstream === '' || repository.upstreamGone
								? ''
								: String(repository.ahead + repository.behind),
						],
						['ALL_WORK_COLUMN_LAST_COMMIT', repository.lastCommitDate],
						['ALL_WORK_COLUMN_VERSION', repository.version],
						['ALL_WORK_COLUMN_PACKAGE_MANAGER', repository.packageManager],
						['ALL_WORK_COLUMN_REMOTE', repository.remote],
					]),
				)
			}
		} finally {
			vi.stubEnv('ALL_WORK_COLUMN_STALE', inherited)
		}
	})

	it('snapshots output variables before queueing and preserves them after the source run is deleted', async () => {
		const source = startRun(
			nodeCommand('process.stdout.write(process.env.ALL_WORK_COLUMN_REPOSITORY)'),
			repositories,
			2,
			1,
		)
		runIds.push(source.id)
		await waitForRun(source)
		const run = startRun(
			nodeCommand(
				'process.stdout.write(process.env.ALL_WORK_COLUMN_RUN_1); setTimeout(() => {}, 200)',
			),
			repositories,
			1,
			2,
			[source],
		)
		runIds.push(run.id)
		for (const result of Object.values(source.results)) {
			result.output = 'changed after submission'
		}

		deleteRun(source.id)
		await waitForRun(run)
		for (const repository of repositories) {
			expect(run.results[repository.id]).toMatchObject({
				output: repository.relativePath,
				status: 'success',
			})
		}
	})

	it.skipIf(isWindows)('records each run with the values it ran with', async () => {
		const command = 'printf \'%s\' "$ALL_WORK_COLUMN_BRANCH"'
		const before = repositories.map((repository) => ({ ...repository, branch: 'before' }))
		const after = repositories.map((repository) => ({ ...repository, branch: 'after' }))
		const first = startRun(command, before, 2, 1)
		runIds.push(first.id)
		await waitForRun(first)
		const second = startRun(command, after, 2, 2)
		runIds.push(second.id)
		await waitForRun(second)
		for (const repository of repositories) {
			expect(first.results[repository.id]).toMatchObject({
				command: 'printf \'%s\' "before"',
				output: 'before',
			})
			expect(second.results[repository.id]).toMatchObject({
				command: 'printf \'%s\' "after"',
				output: 'after',
			})
		}
	})

	it.skipIf(!hasZsh)(
		'loads login and interactive configuration, aliases, functions, and PATH without startup chatter',
		async () => {
			const run = startRun(
				String.raw`all_work_fixture_alias; all_work_fixture_function; all-work-fixture-tool; printf '%s\n' "$ALL_WORK_SHELL_PROFILE"; pwd`,
				repositories,
				2,
				1,
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
				const run = startRun('all_work_fixture_alias', repositories.slice(0, 1), 1, 1)
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
			nodeCommand(
				"console.log(process.cwd()); console.log('standard output'); console.error('standard error'); process.exit(7)",
			),
			repositories,
			2,
			1,
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

	it('reports each repository as its command finishes', async () => {
		const finished: string[] = []
		const run = startRun('echo done', repositories, 2, 1, [], (repository) => {
			finished.push(repository.id)
		})
		runIds.push(run.id)
		await waitForRun(run)
		expect(finished.toSorted()).toEqual(repositories.map((repository) => repository.id).toSorted())
	})

	it('reports only repositories whose commands started before a stop', async () => {
		const finished: string[] = []
		const run = startRun(longRunningCommand, repositories, 1, 1, [], (repository) => {
			finished.push(repository.id)
		})
		runIds.push(run.id)
		await vi.waitFor(() =>
			expect(Object.values(run.results).some((result) => result.output.includes('started'))).toBe(
				true,
			),
		)
		stopRun(run.id)
		await waitForRun(run)
		expect(finished).toHaveLength(1)
	})

	it.skipIf(isWindows)('preserves shell operators, quoting, and Unicode output', async () => {
		const run = startRun(
			String.raw`printf '%s\n' 'café $HOME "quotes"' | cat && printf '%s\n' '日本語' >&2`,
			repositories.slice(0, 1),
			1,
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
		const run = startRun('if then', repositories.slice(0, 1), 1, 1)
		runIds.push(run.id)
		await waitForRun(run)
		const result = Object.values(run.results)[0]
		expect(result?.status).toBe('failed')
		expect(result?.output).toMatch(syntaxErrorPattern)
	})

	it.skipIf(isWindows)(
		'keeps internal runner arguments out of the command positional parameters',
		async () => {
			const run = startRun(String.raw`printf '%s\n' "$#:$1:$2"`, repositories.slice(0, 1), 1, 1)
			runIds.push(run.id)
			await waitForRun(run)
			expect(Object.values(run.results)[0]).toMatchObject({
				output: '0::\n',
				status: 'success',
			})
		},
	)

	it('reports an unavailable user shell and finishes the run', async () => {
		vi.stubEnv(shellVariable, path.join(temporaryDirectory, 'missing-shell'))
		try {
			const run = startRun('echo unreachable', repositories.slice(0, 1), 1, 1)
			runIds.push(run.id)
			await waitForRun(run)
			const result = Object.values(run.results)[0]
			expect(result?.status).toBe('failed')
			expect(result?.output).toContain('ENOENT')
		} finally {
			vi.stubEnv(shellVariable, configuredShell)
		}
	})

	it('streams before completion and obeys the concurrency limit', async () => {
		const run = startRun(
			nodeCommand("process.stdout.write('ready'); setTimeout(() => {}, 300)"),
			repositories,
			1,
			1,
		)
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
		const run = startRun(longRunningCommand, repositories, 1, 1)
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

	it.skipIf(isWindows)(
		'forcefully stops descendant processes that ignore termination signals',
		async () => {
			const run = startRun(
				`'${process.execPath}' -e 'process.on("SIGTERM", () => {}); process.on("SIGHUP", () => {}); console.log("stubborn=" + process.pid); setInterval(() => {}, 1000)' & wait`,
				repositories.slice(0, 1),
				1,
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
		},
	)

	it('bounds captured output while allowing the command to finish', async () => {
		const run = startRun(
			nodeCommand("process.stdout.write('x'.repeat(150000))"),
			repositories.slice(0, 1),
			1,
			1,
		)
		runIds.push(run.id)
		await waitForRun(run)
		const result = Object.values(run.results)[0]
		expect(result).toMatchObject({ status: 'success', truncated: true })
		expect(result?.output.length).toBe(128_000)
	})

	it('deletes retained output and leaves repository files untouched', async () => {
		const run = startRun('echo complete', repositories.slice(0, 1), 1, 1)
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
					headers: { origin: 'https://example.com', 'X-All-Work-Request': '1' },
					method: 'POST',
				}),
				url,
			),
		).rejects.toMatchObject({ status: 403 })
		await expect(
			readRequest(
				new Request(url, {
					body: '{"command":"pwd"}',
					headers: { origin: url.origin, 'X-All-Work-Request': '1' },
					method: 'POST',
				}),
				url,
			),
		).resolves.toEqual({ command: 'pwd' })
	})
})
