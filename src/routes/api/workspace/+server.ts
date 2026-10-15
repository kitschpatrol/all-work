import { error } from '@sveltejs/kit'
import { forgetWorkspace, scanWorkspace } from '#lib/server/repositories.js'
import { readRequest } from '#lib/server/request.js'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, url }) => {
	const body = await readRequest(request, url)
	if (typeof body.directory !== 'string' || body.directory.trim() === '') {
		error(400, 'Enter a directory path.')
	}

	const recursive = body.recursive ?? true
	if (typeof recursive !== 'boolean') {
		error(400, 'Recursive must be a checkbox value.')
	}

	try {
		const workspace = await scanWorkspace(body.directory.trim(), recursive)
		if (typeof body.previousWorkspaceId === 'string') {
			forgetWorkspace(body.previousWorkspaceId)
		}

		return Response.json(workspace)
	} catch (error_) {
		error(400, error_ instanceof Error ? error_.message : 'Could not scan this directory.')
	}
}
