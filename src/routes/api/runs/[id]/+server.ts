import { error } from '@sveltejs/kit'
import { deleteRun, getRun, stopResult, stopRun } from '#lib/server/commands.js'
import { readRequest } from '#lib/server/request.js'
import type { RequestHandler } from './$types'

// A repositoryId stops that repository's command alone; without one, the whole run stops
export const PATCH: RequestHandler = async ({ params, request, url }) => {
	const { repositoryId } = await readRequest(request, url)
	const run = getRun(params.id)
	if (run === undefined) {
		error(404, 'Run not found.')
	}

	if (repositoryId === undefined) {
		stopRun(params.id)
		return Response.json({ stopped: true })
	}

	if (typeof repositoryId !== 'string' || run.results[repositoryId] === undefined) {
		error(404, 'This repository is not part of the run.')
	}

	stopResult(params.id, repositoryId)
	return Response.json({ stopped: true })
}

export const DELETE: RequestHandler = async ({ params, request, url }) => {
	await readRequest(request, url)
	deleteRun(params.id)
	return Response.json({ deleted: true })
}
