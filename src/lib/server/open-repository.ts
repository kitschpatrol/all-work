import { error } from '@sveltejs/kit'
import { execFile } from 'node:child_process'
import { getWorkspace, verifyRepository } from './repositories.js'
import { readRequest } from './request.js'

/** Open a scanned repository folder in a supported native macOS application. */
export async function openRepository(
	request: Request,
	url: URL,
	app: 'Finder' | 'Terminal' | 'Tower',
): Promise<Response> {
	const body = await readRequest(request, url)
	const workspace =
		typeof body.workspaceId === 'string' ? getWorkspace(body.workspaceId) : undefined
	const repository = workspace?.repositories.find((entry) => entry.id === body.repositoryId)
	if (repository === undefined) {
		error(404, 'Reload the folder and choose a repository from the table.')
	}

	if (process.platform !== 'darwin') {
		error(400, `Opening a local repository in ${app} is currently supported on macOS.`)
	}

	try {
		await verifyRepository(repository)
		await new Promise<void>((resolve, reject) => {
			execFile(
				'/usr/bin/open',
				['-a', app, '--', repository.path],
				{ timeout: 15_000 },
				(cause) => {
					if (cause instanceof Error) {
						reject(cause)
					} else {
						resolve()
					}
				},
			)
		})
		return Response.json({ opened: true })
	} catch (error_) {
		error(
			400,
			error_ instanceof Error ? error_.message : `Could not open this repository in ${app}.`,
		)
	}
}
