import { error } from '@sveltejs/kit'
import { deleteRun, getRun, stopRun } from '#lib/server/commands.js'
import { readRequest } from '#lib/server/request.js'
import type { RequestHandler } from './$types'

export const PATCH: RequestHandler = async ({ params, request, url }) => {
	await readRequest(request, url)
	if (getRun(params.id) === undefined) {
		error(404, 'Run not found.')
	}

	stopRun(params.id)
	return Response.json({ stopped: true })
}

export const DELETE: RequestHandler = async ({ params, request, url }) => {
	await readRequest(request, url)
	deleteRun(params.id)
	return Response.json({ deleted: true })
}
