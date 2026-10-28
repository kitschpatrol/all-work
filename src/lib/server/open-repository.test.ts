import type { Repository, Workspace } from '#lib/workspace.js'
import { getWorkspace, verifyRepository } from '#lib/server/repositories.js'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { listReadmeApps, openRepository as openRepositoryInApp } from './open-repository.js'
import { readSettings } from './settings.js'

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }))

vi.mock('#lib/server/repositories.js', () => ({
	getWorkspace: vi.fn(),
	verifyRepository: vi.fn(),
}))
vi.mock('./settings.js', () => ({ readSettings: vi.fn() }))
vi.mock('node:child_process', () => ({
	execFile(
		command: string,
		args: string[],
		options: Record<string, unknown>,
		callback: (error?: Error, stdout?: string) => void,
	) {
		try {
			const stdout: unknown = launch(command, args, options)
			callback(undefined, typeof stdout === 'string' ? stdout : '')
		} catch (error) {
			callback(error instanceof Error ? error : new Error(String(error)))
		}
	},
}))

const repository: Repository = {
	ahead: 0,
	behind: 0,
	branch: 'main',
	changedFiles: 0,
	description: '',
	gitStatusAvailable: true,
	id: 'chosen-repository',
	lastCommit: '',
	lastCommitDate: '',
	name: 'right repo',
	packageManager: '',
	path: '/Users/example/Code/right repo #1 & café',
	readme: '',
	relativePath: 'right repo #1 & café',
	remote: '',
	repoName: 'right repo',
	repoOwner: '',
	upstream: '',
	upstreamGone: false,
	version: '',
}
const workspace: Workspace = {
	directory: '/Users/example/Code',
	id: 'workspace',
	recursive: false,
	repositories: [
		{ ...repository, id: 'other-repository', path: '/Users/example/Code/wrong repo' },
		repository,
	],
	warnings: [],
}

let temporaryDirectory: string

beforeAll(async () => {
	temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'allwork-open-'))
	for (const [name, files] of [
		['with readme', ['readme.txt', 'Readme.md']],
		['without readme', ['notes.md']],
	] as const) {
		const directory = path.join(temporaryDirectory, name)
		await mkdir(directory)
		for (const file of files) {
			await writeFile(path.join(directory, file), '# Fixture\n')
		}

		workspace.repositories.push({ ...repository, id: name, name, path: directory })
	}
})

afterAll(async () => {
	await rm(temporaryDirectory, { force: true, recursive: true })
})

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(getWorkspace).mockReturnValue(workspace)
	vi.mocked(verifyRepository).mockResolvedValue()
	vi.mocked(readSettings).mockResolvedValue({ preferences: undefined, view: undefined })
	launch.mockImplementation((command: string) =>
		command === '/usr/bin/osascript' ? '/Applications/Ghostty.app\n' : '',
	)
})

function localRequest(route: string, body: Record<string, unknown>) {
	const url = new URL(`http://127.0.0.1:5173/api/${route}`)
	const request = new Request(url, {
		body: JSON.stringify(body),
		headers: { 'Content-Type': 'application/json', origin: url.origin, 'X-Allwork-Request': '1' },
		method: 'POST',
	})
	return { request, url }
}

async function openRepository(
	repositoryId: string,
	app: 'Finder' | 'Readme' | 'Terminal' | 'Tower',
) {
	const { request, url } = localRequest(`repositories/${app.toLowerCase()}`, {
		repositoryId,
		workspaceId: workspace.id,
	})
	return openRepositoryInApp(request, url, app)
}

describe.skipIf(process.platform !== 'darwin').each(['Finder', 'Terminal', 'Tower'] as const)(
	'opening a local repository in %s',
	(app) => {
		it('opens the selected row using its exact filesystem path as one native argument', async () => {
			const response = await openRepository(repository.id, app)
			expect(response.status).toBe(200)
			expect(verifyRepository).toHaveBeenCalledWith(repository)
			expect(launch).toHaveBeenCalledTimes(app === 'Terminal' ? 2 : 1)
			expect(launch).toHaveBeenLastCalledWith(
				'/usr/bin/open',
				app === 'Finder'
					? ['-R', '--', repository.path]
					: ['-a', app === 'Terminal' ? '/Applications/Ghostty.app' : app, '--', repository.path],
				{ timeout: 15_000 },
			)
		})

		it('rejects a repository outside the scanned workspace', async () => {
			await expect(openRepository('unknown-repository', app)).rejects.toMatchObject({ status: 404 })
			expect(launch).not.toHaveBeenCalled()
		})

		it('does not launch after the repository path fails verification', async () => {
			vi.mocked(verifyRepository).mockRejectedValue(new Error('Repository path changed.'))
			await expect(openRepository(repository.id, app)).rejects.toMatchObject({
				body: { message: 'Repository path changed.' },
				status: 400,
			})
			expect(launch).not.toHaveBeenCalled()
		})

		it('reports native launch failures instead of silently opening the wrong window', async () => {
			launch.mockImplementation((command: string) => {
				if (command === '/usr/bin/osascript') {
					return '/Applications/Ghostty.app\n'
				}

				throw new Error(`${app} could not be found.`)
			})
			await expect(openRepository(repository.id, app)).rejects.toMatchObject({
				body: { message: `${app} could not be found.` },
				status: 400,
			})
		})
	},
)

describe.skipIf(process.platform !== 'darwin')('the system default terminal', () => {
	it.each(['/Applications/iTerm.app', '/Applications/Custom Terminal.app'])(
		'resolves the current preference on each click and opens %s',
		async (app) => {
			await openRepository(repository.id, 'Terminal')
			launch.mockImplementation((command: string) =>
				command === '/usr/bin/osascript' ? `${app}\n` : '',
			)
			await openRepository(repository.id, 'Terminal')
			expect(launch).toHaveBeenLastCalledWith('/usr/bin/open', ['-a', app, '--', repository.path], {
				timeout: 15_000,
			})
		},
	)

	it('reports a missing default without falling back to a different terminal', async () => {
		launch.mockReturnValue('')
		await expect(openRepository(repository.id, 'Terminal')).rejects.toMatchObject({
			body: { message: 'No default terminal application is configured in macOS.' },
			status: 400,
		})
		expect(launch).not.toHaveBeenCalledWith('/usr/bin/open', expect.anything(), expect.anything())
	})
})

describe.skipIf(process.platform !== 'darwin')('opening a repository readme', () => {
	it.each([
		['the system default', undefined, []],
		['the chosen application', 'com.example.Editor', ['-b', 'com.example.Editor']],
		['the system default instead of an invalid saved app', '-a Terminal', []],
	])('opens the Markdown readme in %s', async (_label, readmeApp, appArguments) => {
		vi.mocked(readSettings).mockResolvedValue({ preferences: { readmeApp }, view: undefined })
		const response = await openRepository('with readme', 'Readme')
		expect(response.status).toBe(200)
		expect(launch).toHaveBeenCalledExactlyOnceWith(
			'/usr/bin/open',
			[...appArguments, '--', path.join(temporaryDirectory, 'with readme', 'Readme.md')],
			{ timeout: 15_000 },
		)
	})

	it('reports a repository without a readme instead of launching an app', async () => {
		await expect(openRepository('without readme', 'Readme')).rejects.toMatchObject({
			body: { message: 'No readme found in without readme.' },
			status: 400,
		})
		expect(launch).not.toHaveBeenCalled()
	})
})

describe.skipIf(process.platform !== 'darwin')('listing applications for readmes', () => {
	async function listApps() {
		const { request, url } = localRequest('readme-apps', {})
		return listReadmeApps(request, url)
	}

	it('names apps as Finder does, sorted, with one entry per bundle identifier', async () => {
		let sample = ''
		let sampleExisted = false
		launch.mockImplementation((_command: string, args: string[]) => {
			sample = args.at(-1) ?? ''
			sampleExisted = existsSync(sample)
			return JSON.stringify({
				apps: [
					{ id: 'com.example.Writer', path: '/Applications/Markdown Writer.app' },
					{ id: 'com.example.Editor', path: '/Applications/Editor.app' },
					{ id: 'com.example.Writer', path: '/Volumes/Backup/Writer Copy.app' },
					{ id: '', path: '/Applications/Unidentified.app' },
					{ id: 'com.example.Pathless' },
				],
				defaultApp: { id: 'com.example.Writer', path: '/Applications/Markdown Writer.app' },
			})
		})
		const response = await listApps()
		await expect(response.json()).resolves.toEqual({
			apps: [
				{ id: 'com.example.Editor', name: 'Editor' },
				{ id: 'com.example.Writer', name: 'Markdown Writer' },
			],
			defaultName: 'Markdown Writer',
		})
		expect(path.basename(sample)).toBe('readme.md')
		expect(sampleExisted).toBe(true)
		expect(existsSync(sample)).toBe(false)
	})

	it('reports an empty default when no app is registered for Markdown', async () => {
		launch.mockReturnValue(JSON.stringify({ apps: [] }))
		const response = await listApps()
		await expect(response.json()).resolves.toEqual({ apps: [], defaultName: '' })
	})

	it('reports why Launch Services could not be queried', async () => {
		launch.mockImplementation(() => {
			throw new Error('osascript timed out')
		})
		await expect(listApps()).rejects.toMatchObject({
			body: { message: 'Could not list applications for readmes: osascript timed out' },
			status: 500,
		})
	})
})
