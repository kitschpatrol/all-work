import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WindowMessage } from './window-messages.js'
import { listenForWindowMessages, postWindowMessage } from './window-messages.js'

const stops: Array<() => void> = []

function listen() {
	const received = vi.fn<(message: WindowMessage) => void>()
	stops.push(listenForWindowMessages(received))
	return received
}

function postRaw(data: unknown) {
	const channel = new BroadcastChannel('allwork-windows')
	channel.postMessage(data)
	channel.close()
}

afterEach(() => {
	for (const stop of stops.splice(0)) {
		stop()
	}
})

describe('output window messages', () => {
	const target = { name: 'a', path: '/workspace/a', repositoryId: 'a', runId: 'run' }

	it('delivers neighbor requests and replies to other windows', async () => {
		const received = listen()
		postWindowMessage({ repositoryId: 'b', runId: 'run', type: 'output-neighbors-request' })
		postWindowMessage({
			next: undefined,
			previous: target,
			repositoryId: 'b',
			runId: 'run',
			type: 'output-neighbors',
		})
		await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(2))
		expect(received.mock.calls.map(([message]) => message)).toEqual([
			{ repositoryId: 'b', runId: 'run', type: 'output-neighbors-request' },
			{
				next: undefined,
				previous: target,
				repositoryId: 'b',
				runId: 'run',
				type: 'output-neighbors',
			},
		])
	})

	it('drops messages that do not say which result they are about', async () => {
		const received = listen()
		postRaw({ runId: 'run', type: 'output-neighbors-request' })
		postRaw({ repositoryId: 'b', runId: 7, type: 'output-neighbors' })
		postRaw({ runId: 'run', type: 'run-removed' })
		await vi.waitFor(() => expect(received).toHaveBeenCalledOnce())
		expect(received).toHaveBeenCalledWith({ runId: 'run', type: 'run-removed' })
	})

	it('treats a malformed neighbor as no neighbor', async () => {
		const received = listen()
		postRaw({
			next: { name: 'c', repositoryId: 'c', runId: 'run' },
			previous: target,
			repositoryId: 'b',
			runId: 'run',
			type: 'output-neighbors',
		})
		await vi.waitFor(() => expect(received).toHaveBeenCalledOnce())
		expect(received).toHaveBeenCalledWith(
			expect.objectContaining({ next: undefined, previous: target }),
		)
	})
})
