import { error } from '@sveltejs/kit'
import { defaultPreferences, parseIdentity } from '#lib/preferences.js'
import { forgetWorkspace, scanWorkspace } from '#lib/server/repositories.js'
import { readRequest } from '#lib/server/request.js'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, url }) => {
	const body = await readRequest(request, url)
	if (typeof body.directory !== 'string' || body.directory.trim() === '') {
		error(400, 'Enter a directory path.')
	}

	const recursive = body.recursive ?? false
	if (typeof recursive !== 'boolean') {
		error(400, 'Recursive must be a checkbox value.')
	}

	const identity =
		body.identity === undefined ? defaultPreferences().identity : parseIdentity(body.identity)
	if (identity === undefined) {
		error(400, 'Enter valid author names and GitHub accounts.')
	}

	try {
		const workspace = await scanWorkspace(body.directory.trim(), recursive, identity)
		if (typeof body.previousWorkspaceId === 'string') {
			forgetWorkspace(body.previousWorkspaceId)
		}

		return Response.json(workspace)
	} catch (error_) {
		error(400, error_ instanceof Error ? error_.message : 'Could not scan this directory.')
	}
}
