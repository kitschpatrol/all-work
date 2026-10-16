import type { MetadataGroup } from '#lib/workspace.js'
import { error } from '@sveltejs/kit'
import { metadataGroups } from '#lib/metadata-columns.js'
import { parseIdentity } from '#lib/preferences.js'
import { getWorkspace, requestWorkspaceMetadata } from '#lib/server/repositories.js'
import { readRequest } from '#lib/server/request.js'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, url }) => {
	const body = await readRequest(request, url)
	const workspace =
		typeof body.workspaceId === 'string' ? getWorkspace(body.workspaceId) : undefined
	if (workspace === undefined) {
		error(404, 'Reload the folder to start a new workspace.')
	}

	if (
		!Array.isArray(body.repositoryIds) ||
		body.repositoryIds.some(
			(id: unknown) =>
				typeof id !== 'string' ||
				workspace.repositories.every((repository) => repository.id !== id),
		)
	) {
		error(400, 'Choose repositories from the loaded folder.')
	}

	if (
		!Array.isArray(body.groups) ||
		body.groups.some(
			(group: unknown) => typeof group !== 'string' || !Object.hasOwn(metadataGroups, group),
		) ||
		(body.force !== undefined && typeof body.force !== 'boolean')
	) {
		error(400, 'Choose valid metadata sources.')
	}

	if (body.identity !== undefined) {
		const identity = parseIdentity(body.identity)
		if (identity === undefined) {
			error(400, 'Enter valid author names and GitHub accounts.')
		}

		workspace.identity = identity
	}

	requestWorkspaceMetadata(
		workspace.id,
		body.repositoryIds as string[],
		body.groups as MetadataGroup[],
		body.force === true,
	)
	return Response.json({ queued: true })
}
