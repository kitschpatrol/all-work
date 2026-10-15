import type { Repository, Workspace } from '#lib/workspace.js'
import { defineTemplate, getMetadata, helpers, templates } from 'metascope'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { access, readdir, realpath, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

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
const projectTemplate = defineTemplate((context, templateData) => ({
	...templates.project(context, templateData),
	packageManager: helpers.firstOf(context.nodePackageJson)?.data.packageManager,
}))

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

async function metadata(directory: string, root: string): Promise<Repository> {
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
		name: path.basename(directory),
		packageManager: '',
		path: directory,
		relativePath: directory === root ? '.' : path.relative(root, directory),
		remote: '',
		version: '',
	}
	try {
		const [status, commit, remote] = await Promise.all([
			git(directory, ['status', '--porcelain=v2', '--branch', '-z']),
			optionalGit(directory, ['log', '-1', '--format=%cI%n%s']),
			optionalGit(directory, ['config', '--get', 'remote.origin.url']),
		])
		readGitStatus(status, repository)
		repository.gitStatusAvailable = true

		const [date = '', ...subject] = commit.split('\n')
		repository.lastCommitDate = date
		repository.lastCommit = subject.join('\n')
		repository.remote = remote
	} catch (error) {
		repository.error = error instanceof Error ? error.message : String(error)
	}

	try {
		const project = await getMetadata({
			offline: true,
			path: directory,
			recursive: false,
			sources: [
				'codemetaJson',
				'gitConfig',
				'nodePackageJson',
				'pythonPyprojectToml',
				'rustCargoToml',
				'goGoMod',
			],
			template: projectTemplate,
			workspaces: false,
		})
		repository.name = project.title ?? repository.name
		repository.version = project.version ?? ''
		repository.description = project.description ?? ''
		repository.packageManager = project.packageManager ?? ''
	} catch (error) {
		// A malformed manifest must not hide an otherwise usable Git repository.
		repository.error ??= `Metascope: ${error instanceof Error ? error.message : String(error)}`
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
		Array.from({ length: Math.min(8, repositories.length) }, async () => {
			while (next < repositories.length) {
				const repositoryPath = repositories[next++]
				if (repositoryPath !== undefined) {
					workspace.repositories.push(await metadata(repositoryPath, directory))
				}
			}
		}),
	)
	workspace.repositories.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
	workspaces.set(workspace.id, workspace)
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
	workspaces.delete(id)
}
