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
		callback: (error?: Error) => void,
	) {
		try {
			launch(command, args, options)
			callback()
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

async function openRepository(repositoryId: string, app: 'Finder' | 'Tower') {
	const url = new URL(`http://127.0.0.1:5173/api/repositories/${app.toLowerCase()}`)
	const request = new Request(url, {
		body: JSON.stringify({ repositoryId, workspaceId: workspace.id }),
		headers: { 'Content-Type': 'application/json', origin: url.origin, 'X-Allwork-Request': '1' },
		method: 'POST',
	})
	return openRepositoryInApp(request, url, app)
}

describe.skipIf(process.platform !== 'darwin').each(['Finder', 'Tower'] as const)(
	'opening a local repository in %s',
	(app) => {
		beforeEach(() => {
			vi.resetAllMocks()
			vi.mocked(getWorkspace).mockReturnValue(workspace)
			vi.mocked(verifyRepository).mockResolvedValue()
		})

		it('opens the selected row using its exact filesystem path as one native argument', async () => {
			const response = await openRepository(repository.id, app)
			expect(response.status).toBe(200)
			expect(verifyRepository).toHaveBeenCalledWith(repository)
			expect(launch).toHaveBeenCalledExactlyOnceWith(
				'/usr/bin/open',
				['-a', app, '--', repository.path],
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
			launch.mockImplementation(() => {
				throw new Error(`${app} could not be found.`)
			})
			await expect(openRepository(repository.id, app)).rejects.toMatchObject({
				body: { message: `${app} could not be found.` },
				status: 400,
			})
		})
	},
)
