import type { Repository, Workspace } from '#lib/workspace.js'
import { getWorkspace, verifyRepository } from '#lib/server/repositories.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openRepository as openRepositoryInApp } from './open-repository.js'

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }))

vi.mock('#lib/server/repositories.js', () => ({
	getWorkspace: vi.fn(),
	verifyRepository: vi.fn(),
}))
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
	relativePath: 'right repo #1 & café',
	remote: '',
	repoName: 'right repo',
	repoOwner: '',
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

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(getWorkspace).mockReturnValue(workspace)
	vi.mocked(verifyRepository).mockResolvedValue()
	launch.mockImplementation((command: string) =>
		command === '/usr/bin/osascript' ? '/Applications/Ghostty.app\n' : '',
	)
})

async function openRepository(repositoryId: string, app: 'Finder' | 'Terminal' | 'Tower') {
	const url = new URL(`http://127.0.0.1:5173/api/repositories/${app.toLowerCase()}`)
	const request = new Request(url, {
		body: JSON.stringify({ repositoryId, workspaceId: workspace.id }),
		headers: { 'Content-Type': 'application/json', origin: url.origin, 'X-Allwork-Request': '1' },
		method: 'POST',
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
				['-a', app === 'Terminal' ? '/Applications/Ghostty.app' : app, '--', repository.path],
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
