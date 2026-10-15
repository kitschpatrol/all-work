import type { MetadataContext } from 'metascope'
import { sourceNames } from 'metascope'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repository, Workspace } from '../workspace.js'
import { metadataColumns } from '../metadata-columns.js'
import { extractMetadata } from './metascope-process.js'
import { startWorkspaceMetadata } from './repository-metadata.js'

vi.mock('./metascope-process.js', () => ({ extractMetadata: vi.fn() }))

let temporaryDirectory: string
const controllers: Array<ReturnType<typeof startWorkspaceMetadata>> = []

function context(data: Partial<MetadataContext> = {}): MetadataContext {
	return Object.assign(
		Object.fromEntries(sourceNames.map((name) => [name, undefined])),
		data,
	) as MetadataContext
}

function fixture(): Workspace {
	const repository: Repository = {
		ahead: 0,
		behind: 0,
		branch: '',
		changedFiles: 0,
		description: '',
		gitStatusAvailable: false,
		id: 'fixture',
		lastCommit: '',
		lastCommitDate: '',
		metadata: { groups: {}, values: {} },
		name: 'fixture',
		packageManager: '',
		path: path.join(temporaryDirectory, 'fixture'),
		relativePath: 'fixture',
		remote: '',
		repoName: 'fixture',
		repoOwner: '',
		version: '',
	}
	return {
		directory: temporaryDirectory,
		id: 'workspace',
		recursive: false,
		repositories: [repository],
		warnings: [],
	}
}

function begin(workspace: Workspace, notify = vi.fn<(repository: Repository) => void>()) {
	const controller = startWorkspaceMetadata(workspace, notify, async (repository) => {
		repository.gitStatusAvailable = true
		repository.branch = 'main'
		await Promise.resolve()
	})
	controllers.push(controller)
	return controller
}

async function ready(workspace: Workspace) {
	await vi.waitFor(() =>
		expect(
			workspace.repositories.every(
				(repository) =>
					repository.metadata?.groups.git?.status === 'ready' &&
					(['code', 'files'] as const).every((group) =>
						['error', 'ready', 'unavailable'].includes(
							repository.metadata?.groups[group]?.status ?? '',
						),
					),
			),
		).toBe(true),
	)
}

beforeEach(async () => {
	temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'allwork-metadata-'))
	vi.stubEnv('ALLWORK_CACHE_DIRECTORY', path.join(temporaryDirectory, 'cache'))
	vi.mocked(extractMetadata).mockReset()
	vi.mocked(extractMetadata).mockResolvedValue(context())
})

afterEach(async () => {
	for (const controller of controllers.splice(0)) {
		controller.dispose()
	}

	await rm(temporaryDirectory, { force: true, recursive: true })
	vi.unstubAllEnvs()
})

describe('progressive Metascope metadata', () => {
	it('covers all 78 Obsidian fields without duplicates', () => {
		expect(metadataColumns).toHaveLength(78)
		expect(new Set(metadataColumns.map((column) => column.field)).size).toBe(78)
		expect(metadataColumns.filter((column) => column.group === 'updates')).toHaveLength(5)
	})

	it('returns control before extraction and automatically scans Git, code, and files offline', async () => {
		const deferred = Promise.withResolvers<MetadataContext>()
		vi.mocked(extractMetadata).mockReturnValueOnce(deferred.promise)

		const workspace = fixture()
		begin(workspace)
		expect(workspace.repositories[0]?.name).toBe('fixture')
		expect(workspace.repositories[0]?.metadata?.groups.git).toBeUndefined()
		await vi.waitFor(() => expect(extractMetadata).toHaveBeenCalledTimes(1))
		deferred.resolve(context())
		await ready(workspace)
		const { calls } = vi.mocked(extractMetadata).mock
		expect(calls).toHaveLength(4)
		expect(calls[0]?.[0]?.sources).not.toContain('gitStats')
		expect(calls[0]?.[0]?.sources).not.toContain('codeStats')
		expect(calls[0]?.[0]?.sources).not.toContain('dependencyUpdates')
		expect(calls[1]?.[0]?.sources).toEqual(['gitStats'])
		expect(calls[2]?.[0]?.sources).toEqual(['codeStats'])
		expect(calls[3]?.[0]?.sources).toEqual(['fileStats'])
		expect(calls.every(([options]) => options?.offline === true)).toBe(true)
	})

	it('leaves skipped flags and update counts unknown, and retains narrow Git fallbacks', async () => {
		const workspace = fixture()
		begin(workspace)
		await ready(workspace)
		const values = workspace.repositories[0]?.metadata?.values
		expect(values?.Public).toBeUndefined()
		expect(values?.Fork).toBeUndefined()
		expect(values?.Published).toBeUndefined()
		expect(values?.['Total Updates']).toBeUndefined()
		expect(values?.['Git Current Branch']).toBe('main')
		expect(values?.['Git Dirty Files']).toBe(0)
	})

	it('restores cached scans, automatically refreshes them on reload, and retains them after a failure', async () => {
		let totalFiles = 42
		vi.mocked(extractMetadata).mockImplementation(async (options) => {
			await Promise.resolve()
			return options?.sources?.includes('fileStats') === true
				? context({
						fileStats: {
							data: { totalFileCount: totalFiles, totalSizeBytes: 1024 },
							source: 'fixture',
						},
					})
				: context()
		})
		const workspace = fixture()
		begin(workspace)
		await ready(workspace)
		expect(workspace.repositories[0]?.metadata?.values['Total Files']).toBe(42)
		// Let the atomic cache write finish before simulating another workspace.
		await vi.waitFor(async () => {
			const files = await readdir(path.join(temporaryDirectory, 'cache'))
			expect(files).toHaveLength(1)
			const saved: unknown = JSON.parse(
				await readFile(path.join(temporaryDirectory, 'cache', files[0] ?? ''), 'utf8'),
			)
			expect(saved).toMatchObject({ values: { 'Total Files': 42 } })
		})
		totalFiles = 84
		const restored: number[] = []
		const reloaded = fixture()
		const next = begin(
			reloaded,
			vi.fn((repository: Repository) => {
				const count = repository.metadata?.values['Total Files']
				if (typeof count === 'number' && repository.metadata?.groups.files?.cached === true) {
					restored.push(count)
				}
			}),
		)
		await ready(reloaded)
		expect(restored).toContain(42)
		expect(reloaded.repositories[0]?.metadata?.values['Total Files']).toBe(84)
		vi.mocked(extractMetadata).mockRejectedValueOnce(new Error('Scan failed'))
		next.request(['fixture'], ['files'], true)
		await vi.waitFor(() =>
			expect(reloaded.repositories[0]?.metadata?.groups.files?.status).toBe('error'),
		)
		expect(reloaded.repositories[0]?.metadata?.values['Total Files']).toBe(84)
	})

	it('loads real zero update counts only after an explicit dependency check', async () => {
		const workspace = fixture()
		const controller = begin(workspace)
		await ready(workspace)
		expect(workspace.repositories[0]?.metadata?.values['Total Updates']).toBeUndefined()
		vi.mocked(extractMetadata).mockResolvedValueOnce(
			context({
				dependencyUpdates: {
					data: { major: [], minor: [], patch: [] },
					extra: { libyears: 0, total: 0 },
					source: 'fixture',
				},
			}),
		)
		controller.request(['fixture'], ['updates'], true)
		await vi.waitFor(() =>
			expect(workspace.repositories[0]?.metadata?.groups.updates?.status).toBe('ready'),
		)
		expect(workspace.repositories[0]?.metadata?.values['Total Updates']).toBe(0)
		expect(workspace.repositories[0]?.metadata?.values.Libyears).toBe(0)
		expect(vi.mocked(extractMetadata).mock.calls.at(-1)?.[0]).toMatchObject({
			offline: false,
			sources: ['dependencyUpdates'],
		})
	})

	it('keeps known false flags and zero counts when a later remote response has no source data', async () => {
		const workspace = fixture()
		const controller = begin(workspace)
		await ready(workspace)
		vi.mocked(extractMetadata).mockResolvedValueOnce(
			Object.assign(context(), {
				github: {
					data: {
						isFork: false,
						isPrivate: true,
						releaseVersionLatest: '2.0.0',
						stargazerCount: 0,
					},
					source: 'https://github.com/example/project',
				},
			}),
		)
		controller.request(['fixture'], ['github'], true)
		await vi.waitFor(() =>
			expect(workspace.repositories[0]?.metadata?.groups.github?.status).toBe('ready'),
		)
		const metadata = workspace.repositories[0]?.metadata
		expect(metadata?.values.Public).toBe(false)
		expect(metadata?.values.Fork).toBe(false)
		expect(metadata?.values.Stars).toBe(0)
		const updatedAt = metadata?.groups.github?.updatedAt
		vi.mocked(extractMetadata).mockResolvedValueOnce(context())
		controller.request(['fixture'], ['github'], true)
		await vi.waitFor(() => expect(metadata?.groups.github?.status).toBe('unavailable'))
		expect(metadata?.values.Stars).toBe(0)
		expect(metadata?.groups.github?.updatedAt).toBe(updatedAt)
		expect(metadata?.groups.github?.cached).toBe(true)
		await vi.waitFor(async () => {
			const files = await readdir(path.join(temporaryDirectory, 'cache'))
			expect(files).toHaveLength(1)
			const saved: unknown = JSON.parse(
				await readFile(path.join(temporaryDirectory, 'cache', files[0] ?? ''), 'utf8'),
			)
			expect(saved).toMatchObject({ values: { 'Latest Release Version': '2.0.0' } })
		})
		// A cached published version must survive the later local-tag fallback.
		vi.mocked(extractMetadata)
			.mockResolvedValueOnce(context())
			.mockResolvedValueOnce(
				context({
					gitStats: {
						data: { branchCurrent: 'main', tagVersionLatest: '1.0.0', uncommittedFileCount: 0 },
						source: 'fixture',
					},
				}),
			)
		const reloaded = fixture()
		begin(reloaded)
		await ready(reloaded)
		expect(reloaded.repositories[0]?.metadata?.values['Latest Release Version']).toBe('2.0.0')
	})

	it('limits work to four repositories and coalesces duplicate source requests', async () => {
		const workspace = fixture()
		const original = workspace.repositories[0]
		if (original === undefined) {
			throw new Error('Missing fixture')
		}

		workspace.repositories = Array.from({ length: 8 }, (_, index) => ({
			...original,
			id: String(index),
			metadata: { groups: {}, values: {} },
			path: `${original.path}-${index}`,
		}))
		const controller = begin(workspace)
		await ready(workspace)
		const baseline = vi.mocked(extractMetadata).mock.calls.length
		const deferred = Promise.withResolvers<MetadataContext>()
		let active = 0
		let maximum = 0
		vi.mocked(extractMetadata).mockImplementation(async () => {
			active++
			maximum = Math.max(maximum, active)
			const result = await deferred.promise
			active--
			return result
		})
		controller.request(
			workspace.repositories.map((repository) => repository.id),
			['github', 'github'],
		)
		await vi.waitFor(() => expect(extractMetadata).toHaveBeenCalledTimes(baseline + 4))
		deferred.resolve(context())
		await vi.waitFor(() =>
			expect(
				workspace.repositories.every(
					(repository) => repository.metadata?.groups.github?.status === 'unavailable',
				),
			).toBe(true),
		)
		expect(extractMetadata).toHaveBeenCalledTimes(baseline + 8)
		expect(maximum).toBe(4)
	})
})
