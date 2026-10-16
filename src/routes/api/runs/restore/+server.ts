import { error } from '@sveltejs/kit'
import { restoreRuns } from '#lib/server/commands.js'
import { getWorkspace } from '#lib/server/repositories.js'
import { readRequest } from '#lib/server/request.js'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, url }) => {
	const body = await readRequest(request, url)
	const workspace =
		typeof body.workspaceId === 'string' ? getWorkspace(body.workspaceId) : undefined
	if (
		workspace === undefined ||
		!Array.isArray(body.ids) ||
		body.ids.length > 1000 ||
		body.ids.some((id: unknown) => typeof id !== 'string')
	) {
		error(400, 'Choose output columns from the saved workspace.')
	}

	return Response.json(
		await restoreRuns(
			body.ids as string[],
			new Set(workspace.repositories.map((repository) => repository.id)),
		),
	)
}
