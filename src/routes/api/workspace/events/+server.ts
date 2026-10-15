import type { Repository } from '#lib/workspace.js'
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
	const pending = new Map<string, Repository>()
	let batchTimer: ReturnType<typeof setTimeout> | undefined
	function cleanup() {
		closed = true
		unsubscribe?.()
		clearInterval(heartbeat)
		clearTimeout(batchTimer)
		pending.clear()
		request.signal.removeEventListener('abort', cleanup)
	}

	const stream = new ReadableStream<Uint8Array>({
		cancel: cleanup,
		start(controller) {
			unsubscribe = subscribeWorkspace(id, (repository) => {
				if (closed) {
					return
				}

				pending.set(repository.id, repository)
				batchTimer ??= setTimeout(() => {
					batchTimer = undefined
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({ repositories: pending.values().toArray(), snapshot: false })}\n\n`,
						),
					)
					pending.clear()
				}, 120)
			})
			controller.enqueue(
				encoder.encode(
					`data: ${JSON.stringify({ repositories: workspace.repositories, snapshot: true })}\n\n`,
				),
			)
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
