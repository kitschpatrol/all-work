import type { MetadataEvent, Repository } from '#lib/workspace.js'
import { error } from '@sveltejs/kit'
import { getWorkspace, subscribeWorkspace } from '#lib/server/repositories.js'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = ({ request, url }) => {
	const id = url.searchParams.get('id') ?? ''
	const workspace = getWorkspace(id)
	if (workspace === undefined) {
		error(404, 'Workspace not found.')
	}

	let closed = false
	let unsubscribe: (() => void) | undefined
	let heartbeat: ReturnType<typeof setInterval> | undefined
	const encoder = new TextEncoder()
	const rows = new Map<string, Repository>()
	const statuses = new Map<string, Repository>()
	const removed = new Set<string>()
	let batchTimer: ReturnType<typeof setTimeout> | undefined
	function cleanup() {
		closed = true
		unsubscribe?.()
		clearInterval(heartbeat)
		clearTimeout(batchTimer)
		rows.clear()
		statuses.clear()
		removed.clear()
		request.signal.removeEventListener('abort', cleanup)
	}

	function send(controller: ReadableStreamDefaultController<Uint8Array>, event: MetadataEvent) {
		controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
	}

	const stream = new ReadableStream<Uint8Array>({
		cancel: cleanup,
		start(controller) {
			// Loading states change far more often than rows, and need only their groups sent
			unsubscribe = subscribeWorkspace(id, (repository, change) => {
				if (closed) {
					return
				}

				if (change === 'removed') {
					rows.delete(repository.id)
					statuses.delete(repository.id)
					removed.add(repository.id)
				} else if (change === 'row') {
					rows.set(repository.id, repository)
				} else {
					statuses.set(repository.id, repository)
				}

				batchTimer ??= setTimeout(() => {
					batchTimer = undefined
					send(controller, {
						removed: removed.values().toArray(),
						repositories: rows.values().toArray(),
						snapshot: false,
						statuses: statuses
							.values()
							.filter((entry) => !rows.has(entry.id))
							.map((entry) => ({ groups: entry.metadata?.groups ?? {}, id: entry.id }))
							.toArray(),
					})
					rows.clear()
					statuses.clear()
					removed.clear()
				}, 120)
			})
			send(controller, {
				removed: [],
				repositories: workspace.repositories,
				snapshot: true,
				statuses: [],
			})
			heartbeat = setInterval(() => {
				controller.enqueue(encoder.encode(': heartbeat\n\n'))
			}, 15_000)
			request.signal.addEventListener('abort', cleanup, { once: true })
		},
	})
	return new Response(stream, {
		headers: {
			'Cache-Control': 'no-cache, no-transform',
			'Content-Type': 'text/event-stream',
			'X-Accel-Buffering': 'no',
		},
	})
}
