import { error } from '@sveltejs/kit'
import { getPendingCommandColumns } from '#lib/column-variables.js'
import { getRun, startRun } from '#lib/server/commands.js'
import { getWorkspace, requestWorkspaceMetadata } from '#lib/server/repositories.js'
import { readRequest } from '#lib/server/request.js'
import { isRunNumber } from '#lib/server/run-cache.js'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, url }) => {
	const body = await readRequest(request, url)
	const workspace =
		typeof body.workspaceId === 'string' ? getWorkspace(body.workspaceId) : undefined
	if (workspace === undefined) {
		error(404, 'Reload the folder to start a new workspace.')
	}

	if (
		typeof body.command !== 'string' ||
		body.command.trim() === '' ||
		body.command.length > 16_000
	) {
		error(400, 'Enter a command (up to 16,000 characters).')
	}

	if (
		!Array.isArray(body.repositoryIds) ||
		body.repositoryIds.some((id: unknown) => typeof id !== 'string')
	) {
		error(400, 'Select repositories to run in.')
	}

	const ids = new Set(body.repositoryIds)
	const repositories = workspace.repositories.filter((repository) => ids.has(repository.id))
	if (repositories.length === 0 || repositories.length !== ids.size) {
		error(400, 'Choose repositories from the loaded folder.')
	}

	const { concurrency } = body
	if (
		typeof concurrency !== 'number' ||
		!Number.isInteger(concurrency) ||
		concurrency < 1 ||
		concurrency > 32
	) {
		error(400, 'Parallel jobs must be between 1 and 32.')
	}

	const { number } = body
	if (!isRunNumber(number)) {
		error(400, 'Invalid run number.')
	}

	const sourceRunIds = body.sourceRunIds ?? []
	if (!Array.isArray(sourceRunIds)) {
		error(400, 'Invalid output columns.')
	}

	const sourceRuns = sourceRunIds.map((id: unknown) => {
		const run = typeof id === 'string' ? getRun(id) : undefined
		if (run === undefined) {
			error(400, 'A previous output column is no longer available. Clear it and try again.')
		}

		return run
	})
	const pendingColumns = getPendingCommandColumns(body.command, repositories)
	if (pendingColumns.length > 0) {
		error(
			409,
			`Metadata is still loading for: ${pendingColumns.join(', ')}. Wait for it to finish, or load it for the selected rows from the Metadata menu, before running.`,
		)
	}

	// A command may commit, switch branches, or change files, so each
	// repository's Git status refreshes as its command finishes
	return Response.json(
		startRun(body.command.trim(), repositories, concurrency, number, sourceRuns, (repository) => {
			requestWorkspaceMetadata(workspace.id, [repository.id], ['git'], true)
		}),
		{
			status: 201,
		},
	)
}
