import type { ProjectIdentity } from '#lib/preferences.js'
import type { MetadataChange, Repository, Workspace } from '#lib/workspace.js'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { access, readdir, realpath, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { findReadme } from './readme.js'
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
type WorkspaceListener = (repository: Repository, change: MetadataChange) => void
const workspaceListeners = new Map<string, Set<WorkspaceListener>>()

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

/**
 * Read the branch, upstream comparison, and changed file count from `git status
 * --porcelain=v2 --branch -z` output.
 */
export function parseGitStatus(status: string) {
	const parsed = {
		ahead: 0,
		behind: 0,
		branch: '',
		changedFiles: 0,
		upstream: '',
		upstreamGone: false,
	}
	let skipRenameSource = false
	for (const entry of status.split('\0')) {
		if (skipRenameSource) {
			skipRenameSource = false
			continue
		}

		if (entry.startsWith('# branch.head ')) {
			parsed.branch = entry.slice('# branch.head '.length)
		} else if (entry.startsWith('# branch.upstream ')) {
			parsed.upstream = entry.slice('# branch.upstream '.length)
			parsed.upstreamGone = true
		} else if (entry.startsWith('# branch.ab ')) {
			// Git omits this line when the upstream ref is missing locally
			const counts = branchCounts.exec(entry)
			parsed.ahead = Number(counts?.[1] ?? 0)
			parsed.behind = Number(counts?.[2] ?? 0)
			parsed.upstreamGone = false
		} else if (changedEntry.test(entry)) {
			parsed.changedFiles++
			skipRenameSource = entry.startsWith('2 ')
		}
	}

	return parsed
}

async function supplementGitMetadata(repository: Repository) {
	// Metascope 0.13 returns no gitStats for unborn repositories or linked
	// worktrees. Only query status directly when that source has no data.
	if (!repository.gitStatusAvailable) {
		try {
			Object.assign(
				repository,
				parseGitStatus(await git(repository.path, ['status', '--porcelain=v2', '--branch', '-z'])),
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

/**
 * Name and list a repository by the path it was found at, which may pass
 * through a symlink, while running Git in its resolved directory.
 */
async function createRepository(
	directory: string,
	realPath: string,
	root: string,
	readme: string,
): Promise<Repository> {
	const repository: Repository = {
		ahead: 0,
		behind: 0,
		branch: '',
		changedFiles: 0,
		description: '',
		gitStatusAvailable: false,
		id: createHash('sha256').update(realPath).digest('hex'),
		lastCommit: '',
		lastCommitDate: '',
		metadata: { groups: {}, values: {} },
		name: path.basename(directory),
		packageManager: '',
		path: realPath,
		readme,
		relativePath: directory === root ? '.' : path.relative(root, directory),
		remote: '',
		repoName: path.basename(directory),
		repoOwner: '',
		upstream: '',
		upstreamGone: false,
		version: '',
		website: '',
	}
	// Linked worktrees keep their effective config outside the repository directory.
	const gitEntry = await stat(path.join(realPath, '.git'))
	if (gitEntry.isFile()) {
		repository.remote = await optionalGit(realPath, ['config', '--get', 'remote.origin.url'])
	}

	return repository
}

/**
 * Whether a symlink resolves to a Git repository rather than a file or other
 * folder.
 */
async function linksToRepository(link: string): Promise<boolean> {
	try {
		await stat(path.join(link, '.git'))
		return true
	} catch (error) {
		if (
			error instanceof Error &&
			'code' in error &&
			(error.code === 'ENOENT' || error.code === 'ENOTDIR')
		) {
			return false
		}

		throw error
	}
}

/**
 * Find Git roots and worktrees at the chosen depth. Symlinks are followed only
 * when they point to a repository, and each repository is listed once.
 */
export async function scanWorkspace(
	input: string,
	recursive = true,
	identity?: ProjectIdentity,
): Promise<Workspace> {
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
		identity,
		recursive,
		repositories: [],
		warnings: [],
	}
	const directories = [directory]
	const links: string[] = []
	const repositories: Array<{ directory: string; readme: string; realPath: string }> = []
	const repositoryPaths = new Set<string>()
	while (directories.length > 0 || links.length > 0) {
		// Links wait until every direct path is scanned, so a repository
		// reachable both ways keeps its direct path.
		const isLink = directories.length === 0
		const current = isLink ? links.shift() : directories.pop()
		if (current === undefined) {
			break
		}

		try {
			if (isLink && !(await linksToRepository(current))) {
				continue
			}

			const entries = await readdir(current, { withFileTypes: true })
			if (
				entries.some((entry) => entry.name === '.git' && (entry.isDirectory() || entry.isFile()))
			) {
				const realPath = await realpath(current)
				// Skipping a repository already seen also ends symlink cycles.
				if (repositoryPaths.has(realPath)) {
					continue
				}

				repositoryPaths.add(realPath)
				repositories.push({ directory: current, readme: findReadme(entries), realPath })
			}

			if (!recursive && current !== directory) {
				continue
			}

			for (const entry of entries) {
				if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
					directories.push(path.join(current, entry.name))
				} else if (entry.isSymbolicLink()) {
					links.push(path.join(current, entry.name))
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
				const found = repositories[next++]
				if (found !== undefined) {
					workspace.repositories.push(
						await createRepository(found.directory, found.realPath, directory, found.readme),
					)
				}
			}
		}),
	)
	workspace.repositories.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
	workspaces.set(workspace.id, workspace)
	const metadata = startWorkspaceMetadata(
		workspace,
		(repository, change) => {
			const listeners = workspaceListeners.get(workspace.id) ?? []
			for (const listener of listeners) {
				listener(repository, change)
			}
		},
		supplementGitMetadata,
	)
	metadataControllers.set(workspace.id, metadata)
	// Rows first appear with their cached names, branches, and other metadata
	await metadata.restored
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
	prioritize = true,
) {
	metadataControllers.get(id)?.request(repositoryIds, groups, force, prioritize)
}

/**
 * Subscribe to changed rows and loading states, with a snapshot supplied by the
 * event endpoint.
 */
export function subscribeWorkspace(id: string, listener: WorkspaceListener) {
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
