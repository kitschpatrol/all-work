import type { Repository, Workspace } from '#lib/workspace.js'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { access, readdir, realpath, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { startWorkspaceMetadata } from './repository-metadata.js'

const branchCounts = /\+(\d+) -(\d+)/v
const changedEntry = /^[12u?] /v
const ignoredDirectories = new Set([
	'.cache',
	'.git',
	'.hg',
	'.next',
	'.nuxt',
	'.svelte-kit',
	'.svn',
	'.Trash',
	'.venv',
	'__pycache__',
	'build',
	'coverage',
	'dist',
	'node_modules',
	'vendor',
	'venv',
])
const workspaces = new Map<string, Workspace>()
const metadataControllers = new Map<string, ReturnType<typeof startWorkspaceMetadata>>()
const workspaceListeners = new Map<string, Set<(repository: Repository) => void>>()

async function git(directory: string, args: string[]): Promise<string> {
	const environment = {
		...process.env,
		// eslint-disable-next-line ts/naming-convention -- Git expects this exact environment variable name.
		GIT_OPTIONAL_LOCKS: '0',
	}
	const stdout = await new Promise<string>((resolve, reject) => {
		execFile(
			'git',
			['-C', directory, ...args],
			{
				env: environment,
				maxBuffer: 4 * 1024 * 1024,
				timeout: 15_000,
			},
			(error, output) => {
				if (error instanceof Error) {
					reject(error)
				} else {
					resolve(output)
				}
			},
		)
	})
	return stdout.trim()
}

async function optionalGit(directory: string, args: string[]): Promise<string> {
	try {
		return await git(directory, args)
	} catch {
		return ''
	}
}

function readGitStatus(status: string, repository: Repository) {
	let skipRenameSource = false
	for (const entry of status.split('\0')) {
		if (skipRenameSource) {
			skipRenameSource = false
			continue
		}

		if (entry.startsWith('# branch.head ')) {
			repository.branch = entry.slice('# branch.head '.length)
		} else if (entry.startsWith('# branch.ab ')) {
			const counts = branchCounts.exec(entry)
			repository.ahead = Number(counts?.[1] ?? 0)
			repository.behind = Number(counts?.[2] ?? 0)
		} else if (changedEntry.test(entry)) {
			repository.changedFiles++
			skipRenameSource = entry.startsWith('2 ')
		}
	}
}

async function supplementGitMetadata(repository: Repository) {
	// Metascope 0.13 returns no gitStats for unborn repositories or linked
	// worktrees. Only query status directly when that source has no data.
	if (!repository.gitStatusAvailable) {
		try {
			readGitStatus(
				await git(repository.path, ['status', '--porcelain=v2', '--branch', '-z']),
				repository,
			)
			repository.gitStatusAvailable = true
		} catch (error) {
			repository.error ??= error instanceof Error ? error.message : String(error)
		}
	}

	// Metascope exposes the commit date but not its subject, used by the tooltip.
	const commit = await optionalGit(repository.path, ['log', '-1', '--format=%cI%n%s'])
	const [date = '', ...subject] = commit.split('\n')
	if (repository.lastCommitDate === '') {
		repository.lastCommitDate = date
	}

	repository.lastCommit = subject.join('\n')
}

async function createRepository(directory: string, root: string): Promise<Repository> {
	const repository: Repository = {
		ahead: 0,
		behind: 0,
		branch: '',
		changedFiles: 0,
		description: '',
		gitStatusAvailable: false,
		id: createHash('sha256').update(directory).digest('hex'),
		lastCommit: '',
		lastCommitDate: '',
		metadata: { groups: {}, values: {} },
		name: path.basename(directory),
		packageManager: '',
		path: directory,
		relativePath: directory === root ? '.' : path.relative(root, directory),
		remote: '',
		repoName: path.basename(directory),
		repoOwner: '',
		version: '',
	}
	// Linked worktrees keep their effective config outside the repository directory.
	const gitEntry = await stat(path.join(directory, '.git'))
	if (gitEntry.isFile()) {
		repository.remote = await optionalGit(directory, ['config', '--get', 'remote.origin.url'])
	}

	return repository
}

/** Find Git roots and worktrees at the chosen depth, without following symlinks. */
export async function scanWorkspace(input: string, recursive = true): Promise<Workspace> {
	const expanded =
		input === '~'
			? os.homedir()
			: input.startsWith('~/')
				? path.join(os.homedir(), input.slice(2))
				: input
	const directory = await realpath(path.resolve(expanded))
	const directoryStat = await stat(directory)
	if (!directoryStat.isDirectory()) {
		throw new Error('Choose a directory to scan.')
	}

	const workspace: Workspace = {
		directory,
		id: randomUUID(),
		recursive,
		repositories: [],
		warnings: [],
	}
	const directories = [directory]
	const repositories: string[] = []
	while (directories.length > 0) {
		const current = directories.pop()
		if (current === undefined) {
			break
		}

		try {
			const entries = await readdir(current, { withFileTypes: true })
			if (
				entries.some((entry) => entry.name === '.git' && (entry.isDirectory() || entry.isFile()))
			) {
				repositories.push(current)
			}

			if (!recursive && current !== directory) {
				continue
			}

			for (const entry of entries) {
				if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
					directories.push(path.join(current, entry.name))
				}
			}
		} catch {
			workspace.warnings.push(`Could not read ${current}`)
		}
	}

	let next = 0
	await Promise.all(
		Array.from({ length: Math.min(4, repositories.length) }, async () => {
			while (next < repositories.length) {
				const repositoryPath = repositories[next++]
				if (repositoryPath !== undefined) {
					workspace.repositories.push(await createRepository(repositoryPath, directory))
				}
			}
		}),
	)
	workspace.repositories.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
	workspaces.set(workspace.id, workspace)
	metadataControllers.set(
		workspace.id,
		startWorkspaceMetadata(
			workspace,
			(repository) => {
				const listeners = workspaceListeners.get(workspace.id) ?? []
				for (const listener of listeners) {
					listener(repository)
				}
			},
			supplementGitMetadata,
		),
	)
	return workspace
}

/**
 * Return a previously scanned workspace; commands cannot supply arbitrary
 * working directories.
 */
export function getWorkspace(id: string): undefined | Workspace {
	return workspaces.get(id)
}

/**
 * Verify that a discovered working directory has not been replaced with a
 * symlink.
 */
export async function verifyRepository(repository: Repository): Promise<void> {
	if ((await realpath(repository.path)) !== repository.path) {
		throw new Error('Repository path changed. Reload the folder.')
	}

	await access(path.join(repository.path, '.git'))
}

/** Release a previous scan once its replacement has loaded. */
export function forgetWorkspace(id: string): void {
	metadataControllers.get(id)?.dispose()
	metadataControllers.delete(id)
	workspaceListeners.delete(id)
	workspaces.delete(id)
}

/** Queue source groups only for repositories discovered in this workspace. */
export function requestWorkspaceMetadata(
	id: string,
	repositoryIds: string[],
	groups: Parameters<ReturnType<typeof startWorkspaceMetadata>['request']>[1],
	force = false,
) {
	metadataControllers.get(id)?.request(repositoryIds, groups, force, true)
}

/**
 * Subscribe to row replacements, with a snapshot supplied by the event
 * endpoint.
 */
export function subscribeWorkspace(id: string, listener: (repository: Repository) => void) {
	let listeners = workspaceListeners.get(id)
	if (listeners === undefined) {
		listeners = new Set()
		workspaceListeners.set(id, listeners)
	}

	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}
