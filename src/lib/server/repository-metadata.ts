import type { ProjectIdentity } from '#lib/preferences.js'
import type {
	MetadataGroup,
	MetadataState,
	MetadataValue,
	Repository,
	Workspace,
} from '#lib/workspace.js'
import type { MetadataContext, SourceName } from 'metascope'
import { metadataColumns, metadataGroups } from '#lib/metadata-columns.js'
import { defaultPreferences } from '#lib/preferences.js'
import { sourceNames } from 'metascope'
import { createHash } from 'node:crypto'
import { access, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cacheDirectory } from './cache.js'
import { resolveGithubToken } from './github-token.js'
import { extractMetadata } from './metascope-process.js'
import { findReadme } from './readme.js'
import { repositoryTemplate } from './repository-template.js'

const remoteSources = new Set<SourceName>([
	'codeStats',
	'dependencyUpdates',
	'fileStats',
	'github',
	'githubActions',
	'gitStats',
	'nodeNpmRegistry',
	'obsidianPluginRegistry',
	'pythonPypiRegistry',
])
const localSources = sourceNames.filter((source) => !remoteSources.has(source))
const sources: Record<MetadataGroup, SourceName[]> = {
	ci: ['gitConfig', 'githubActions'],
	code: ['codeStats'],
	files: ['fileStats'],
	git: ['gitStats'],
	github: ['gitConfig', 'github'],
	local: localSources,
	registry: [
		'nodePackageJson',
		'obsidianPluginManifestJson',
		'pythonPyprojectToml',
		'pythonSetupCfg',
		'pythonSetupPy',
		'pythonPkgInfo',
		'nodeNpmRegistry',
		'pythonPypiRegistry',
		'obsidianPluginRegistry',
	],
	updates: ['dependencyUpdates'],
}
const cacheAges: Partial<Record<MetadataGroup, number>> = {
	ci: 2 * 60_000,
	github: 15 * 60_000,
	registry: 24 * 60 * 60_000,
}
const persistedGroups = new Set<MetadataGroup>([
	'ci',
	'code',
	'files',
	'github',
	'registry',
	'updates',
])
const releaseFields = new Set(['Latest Release Date', 'Latest Release Version', 'Releases'])

function cachePath(repository: Repository, group: MetadataGroup, identity?: ProjectIdentity) {
	// Include the credential identity without persisting credentials themselves.
	const credentialsIdentity = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? 'default-user'
	const key = createHash('sha256')
		.update(
			`3\0${repository.path}\0${credentialsIdentity}\0${JSON.stringify(identity ?? defaultPreferences().identity)}\0${group}`,
		)
		.digest('hex')
	return path.join(cacheDirectory('metadata'), `${key}.json`)
}

function isValue(value: unknown): value is MetadataValue {
	return (
		typeof value === 'string' ||
		typeof value === 'boolean' ||
		(typeof value === 'number' && Number.isFinite(value)) ||
		(Array.isArray(value) && value.every((item: unknown) => typeof item === 'string'))
	)
}

async function restoreCache(repository: Repository, identity?: ProjectIdentity) {
	for (const group of persistedGroups) {
		try {
			const cached: unknown = JSON.parse(
				await readFile(cachePath(repository, group, identity), 'utf8'),
			)
			if (
				typeof cached !== 'object' ||
				cached === null ||
				!('updatedAt' in cached) ||
				typeof cached.updatedAt !== 'string' ||
				!Number.isFinite(Date.parse(cached.updatedAt)) ||
				!('values' in cached) ||
				typeof cached.values !== 'object' ||
				cached.values === null
			) {
				continue
			}

			const { metadata } = repository
			if (metadata === undefined) {
				continue
			}

			for (const [key, value] of Object.entries(cached.values)) {
				if (metadataColumns.some((column) => column.field === key) && isValue(value)) {
					metadata.values[key] = value
				}
			}

			metadata.groups[group] = { cached: true, status: 'ready', updatedAt: cached.updatedAt }
		} catch {
			// A missing or damaged cache never prevents a local scan.
		}
	}
}

async function saveCache(repository: Repository, group: MetadataGroup, identity?: ProjectIdentity) {
	if (!persistedGroups.has(group) || repository.metadata === undefined) {
		return
	}

	const { metadata } = repository
	const fields = metadataColumns
		.filter((column) => column.group === group)
		.map((column) => column.field)
	const extraFields: Partial<Record<MetadataGroup, string[]>> = {
		code: ['Language'],
		github: ['Status'],
		registry: [...releaseFields],
	}
	fields.push(...(extraFields[group] ?? []))

	const values = Object.fromEntries(
		fields
			.filter((field) => metadata.values[field] !== undefined)
			.map((field) => [field, metadata.values[field]]),
	)
	const file = cachePath(repository, group, identity)
	const temporaryFile = `${file}.${process.pid}.tmp`
	try {
		await mkdir(cacheDirectory('metadata'), { mode: 0o700, recursive: true })
		await writeFile(
			temporaryFile,
			JSON.stringify({ updatedAt: metadata.groups[group]?.updatedAt, values }),
			{ mode: 0o600 },
		)
		await rename(temporaryFile, file)
	} catch {
		// Metadata remains usable when the cache directory is unavailable.
	}
}

type Project = ReturnType<typeof repositoryTemplate>

function fieldAvailable(
	field: string,
	group: MetadataGroup,
	project: Project,
	context: MetadataContext,
) {
	if (group === 'local') {
		return true
	}

	if (releaseFields.has(field)) {
		return project.available.github || project.available.git || project.available.registry
	}

	return field === 'Language'
		? project.available.github || context.codemetaJson !== undefined || project.available.code
		: project.available[group]
}

function applyIdentity(repository: Repository, project: Project) {
	repository.name = project.title ?? repository.name
	repository.description = project.description ?? repository.description
	repository.version = project.version ?? repository.version
	repository.packageManager = project.packageManager ?? repository.packageManager
	repository.remote = project.remote ?? repository.remote
	repository.repoName = project.repoName ?? repository.repoName
	repository.repoOwner = project.repoOwner ?? repository.repoOwner
	if (!project.gitStatusAvailable) {
		return
	}

	repository.branch = project.branch ?? ''
	repository.changedFiles = project.changedFiles ?? 0
	repository.gitStatusAvailable = true
	repository.ahead = project.ahead
	repository.behind = project.behind
	repository.upstream = project.upstream
	repository.upstreamGone = project.upstreamGone
	repository.lastCommitDate = project.lastCommitDate ?? ''
}

function preserveCachedRemoteValue(
	repository: Repository,
	field: string,
	group: MetadataGroup,
	project: Project,
) {
	const { metadata } = repository
	return (
		metadata?.values[field] !== undefined &&
		((group === 'github' && metadata.groups.github?.cached === true && !project.available.github) ||
			(releaseFields.has(field) &&
				metadata.groups.registry?.cached === true &&
				!project.available.registry))
	)
}

function applyContext(
	repository: Repository,
	context: MetadataContext,
	refreshed: MetadataGroup,
	identity = defaultPreferences().identity,
) {
	const project = repositoryTemplate(context, {
		authorName: identity.authorNames,
		githubAccount: identity.githubAccounts,
		originRemote: repository.remote,
	})
	const { metadata } = repository
	if (metadata === undefined) {
		return
	}

	for (const column of metadataColumns) {
		if (
			column.field === 'Homebrew' ||
			column.field === 'Monorepo' ||
			!fieldAvailable(column.field, column.group, project, context)
		) {
			continue
		}

		const rawValue: unknown = Reflect.get(project.frontmatter, column.field)
		const value = rawValue === false && column.field === 'Git LFS' ? undefined : rawValue
		if (
			['code', 'files', 'git', 'local'].includes(refreshed) &&
			preserveCachedRemoteValue(repository, column.field, column.group, project)
		) {
			continue
		}

		if (!isValue(value)) {
			if (column.group === refreshed) {
				Reflect.deleteProperty(metadata.values, column.field)
			}

			continue
		}

		metadata.values[column.field] = value
	}

	const dependencies = [
		...(project.frontmatter.Dependencies ?? []),
		...(project.frontmatter['Dev Dependencies'] ?? []),
	]
	metadata.values.Homebrew = dependencies.includes('brewpub')
	applyIdentity(repository, project)
}

async function detectMonorepo(repository: Repository, context: MetadataContext) {
	const workspaceManifest = context.nodePackageJson
	const packages = Array.isArray(workspaceManifest)
		? workspaceManifest
		: workspaceManifest === undefined
			? []
			: [workspaceManifest]
	let monorepo = packages.some((entry) => entry.data.workspaces !== undefined)
	try {
		await access(path.join(repository.path, 'pnpm-workspace.yaml'))
		monorepo = true
	} catch {
		// Other workspace signals are supplied by the root package manifest.
	}

	if (repository.metadata !== undefined) {
		repository.metadata.values.Monorepo = monorepo
	}
}

async function detectReadme(repository: Repository) {
	try {
		repository.readme = findReadme(await readdir(repository.path, { withFileTypes: true }))
	} catch {
		// An unreadable root has no readme the shortcut button could open.
		repository.readme = ''
	}
}

async function applyGitSupplement(
	repository: Repository,
	available: boolean,
	supplement: (repository: Repository) => Promise<void>,
) {
	if (!available) {
		repository.gitStatusAvailable = false
	}

	await supplement(repository)
	if (!repository.gitStatusAvailable || repository.metadata === undefined) {
		return
	}

	Object.assign(repository.metadata.values, {
		'Git Current Branch': repository.branch,
		'Git Dirty Files': repository.changedFiles,
		'Latest Commit Date': repository.lastCommitDate,
	})
}

function needsRefresh(state: MetadataState | undefined, group: MetadataGroup, force: boolean) {
	if (state?.status === 'loading' || state?.status === 'queued') {
		return false
	}

	if (force || state === undefined) {
		return true
	}

	const age = cacheAges[group]
	return age !== undefined && Date.now() - Date.parse(state.updatedAt ?? '') >= age
}

// Background work runs local scans first and network sources last
const backgroundPriorities: Record<MetadataGroup, number> = {
	ci: 5,
	code: 4,
	files: 4,
	git: 3,
	github: 5,
	local: 2,
	registry: 5,
	updates: 5,
}

function normalizeContext(extracted: unknown): MetadataContext {
	// Metascope returns undefined when none of the selected sources produce data.
	return Object.assign(
		Object.fromEntries(sourceNames.map((name) => [name, undefined])),
		typeof extracted === 'object' && extracted !== null ? extracted : {},
	) as MetadataContext
}

/**
 * Run bounded, progressive source groups and retain successful enrichment
 * across scans.
 */
export function startWorkspaceMetadata(
	workspace: Workspace,
	notify: (repository: Repository) => void,
	supplementGit: (repository: Repository) => Promise<void>,
) {
	type Job = { group: MetadataGroup; priority: number; repository: Repository }
	const contexts = new Map<string, MetadataContext>()
	const busy = new Set<string>()
	const queue: Job[] = []
	let disposed = false
	let active = 0
	const controller = new AbortController()
	// Looked up once, when the first network source needs it
	let githubToken: Promise<string | undefined> | undefined

	async function extract({ group, repository }: Job) {
		const { metadata } = repository
		if (metadata === undefined) {
			return
		}

		metadata.groups[group] = { ...metadata.groups[group], error: undefined, status: 'loading' }
		notify(repository)
		try {
			const offline = ['code', 'files', 'git', 'local'].includes(group)
			if (!offline) {
				githubToken ??= resolveGithubToken()
			}

			const extracted: unknown = await extractMetadata(
				{
					absolute: true,
					credentials: offline ? {} : { githubToken: await githubToken },
					offline,
					path: repository.path,
					recursive: false,
					sources: sources[group],
					workspaces: false,
				},
				controller.signal,
			)
			if (disposed) {
				return
			}

			const context = normalizeContext(extracted)

			const combined = contexts.get(repository.id) ?? context
			for (const key of sourceNames) {
				if (context[key] !== undefined) {
					Object.assign(combined, { [key]: context[key] })
				}
			}

			contexts.set(repository.id, combined)
			applyContext(repository, combined, group, workspace.identity)
			const { available } = repositoryTemplate(context, {})
			if (group === 'local') {
				await Promise.all([detectMonorepo(repository, context), detectReadme(repository)])
			} else if (group === 'git') {
				await applyGitSupplement(repository, available.git, supplementGit)
			}

			const succeeded =
				group === 'local' || available[group] || (group === 'git' && repository.gitStatusAvailable)
			metadata.groups[group] = succeeded
				? { status: 'ready', updatedAt: new Date().toISOString() }
				: {
						...metadata.groups[group],
						cached: metadata.groups[group].updatedAt !== undefined,
						error: `${metadataGroups[group]} unavailable. The source may not apply, or may require credentials or network access.`,
						status: 'unavailable',
					}
			if (succeeded) {
				await saveCache(repository, group, workspace.identity)
			}
		} catch (error) {
			metadata.groups[group] = {
				...metadata.groups[group],
				cached: metadata.groups[group].updatedAt !== undefined,
				error: error instanceof Error ? error.message : String(error),
				status: 'error',
			}
		} finally {
			if (!disposed) {
				notify(repository)
				if (group === 'local') {
					request([repository.id], ['git'])
				}
			}
		}
	}

	function pump() {
		if (disposed) {
			return
		}

		queue.sort((a, b) => a.priority - b.priority)
		while (active < 4) {
			const index = queue.findIndex(
				(job) =>
					!busy.has(job.repository.id) &&
					(job.group === 'local' ||
						['error', 'ready', 'unavailable'].includes(
							job.repository.metadata?.groups.local?.status ?? '',
						)),
			)
			if (index === -1) {
				break
			}

			const job = queue.splice(index, 1)[0]
			if (job === undefined) {
				break
			}

			active++
			busy.add(job.repository.id)
			void runJob(job)
		}
	}

	async function runJob(job: Job) {
		try {
			await extract(job)
		} finally {
			active--
			busy.delete(job.repository.id)
			pump()
		}
	}

	function request(ids: string[], groups: MetadataGroup[], force = false, prioritize = false) {
		for (const id of ids) {
			const repository = workspace.repositories.find((entry) => entry.id === id)
			if (repository?.metadata === undefined) {
				continue
			}

			if (prioritize) {
				const local = queue.find((job) => job.repository.id === id && job.group === 'local')
				if (local !== undefined) {
					local.priority = 0
				}
			}

			for (const group of groups) {
				const state = repository.metadata.groups[group]
				const queued = queue.find((job) => job.repository.id === id && job.group === group)
				if (queued !== undefined && prioritize) {
					queued.priority = group === 'local' ? 0 : 1
				}

				if (!needsRefresh(state, group, force)) {
					continue
				}

				repository.metadata.groups[group] = { ...state, status: 'queued' }
				queue.push({
					group,
					priority: prioritize ? 1 : backgroundPriorities[group],
					repository,
				})
				notify(repository)
			}
		}

		pump()
	}

	void Promise.all(
		workspace.repositories.map(async (repository) => {
			await restoreCache(repository, workspace.identity)
			if (disposed) {
				return
			}

			notify(repository)
			request([repository.id], ['local', 'git', 'code', 'files'], true)
		}),
	)
	return {
		dispose() {
			disposed = true
			controller.abort()
			queue.length = 0
			contexts.clear()
		},
		request,
	}
}
