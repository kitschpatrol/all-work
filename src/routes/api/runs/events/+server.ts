import { error } from '@sveltejs/kit'
import { getRun, subscribeRun } from '#lib/server/commands.js'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = ({ request, url }) => {
	const ids = [...new Set((url.searchParams.get('ids') ?? '').split(',').filter(Boolean))]
	if (ids.length === 0 || ids.some((id) => getRun(id) === undefined)) {
		error(404, 'Run not found.')
	}

	const remaining = new Set(ids)
	const subscriptions: Array<() => void> = []
	let heartbeat: ReturnType<typeof setInterval> | undefined
	let closed = false
	const encoder = new TextEncoder()
	function cleanup() {
		closed = true
		for (const unsubscribe of subscriptions) {
			unsubscribe()
		}

		clearInterval(heartbeat)
		request.signal.removeEventListener('abort', cleanup)
	}

	function subscribe(runId: string, controller: ReadableStreamDefaultController<Uint8Array>) {
		return subscribeRun(runId, (event) => {
			if (closed) {
				return
			}

			controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...event, runId })}\n\n`))
			if (event.type !== 'finished') {
				return
			}

			remaining.delete(runId)
			if (remaining.size > 0) {
				return
			}

			cleanup()
			controller.close()
		})
	}

	const stream = new ReadableStream<Uint8Array>({
		cancel: cleanup,
		start(controller) {
			for (const runId of ids) {
				subscriptions.push(subscribe(runId, controller))
			}

			if (closed) {
				return
			}

			heartbeat = setInterval(() => {
				controller.enqueue(encoder.encode(': heartbeat\n\n'))
			}, 15_000)
			request.signal.addEventListener('abort', cleanup, { once: true })
		},
	})
	return new Response(stream, {
		headers: {
			'Cache-Control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'Content-Type': 'text/event-stream',
			'X-Accel-Buffering': 'no',
		},
	})
}
