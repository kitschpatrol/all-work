import type { MetadataEvent } from './workspace.js'

/**
 * Receive repository changes for a workspace. The server batches them, so each
 * event applies as one table update.
 */
export function watchWorkspaceMetadata(
	id: string,
	onEvent: (event: MetadataEvent) => void,
	onError: () => void,
) {
	// eslint-disable-next-line node/no-unsupported-features/node-builtins -- This EventSource runs in the browser.
	const stream = new EventSource(`/api/workspace/events?id=${id}`)
	stream.addEventListener('message', (message) => {
		onEvent(JSON.parse(String(message.data)) as MetadataEvent)
	})
	stream.addEventListener('error', () => {
		if (stream.readyState === 2) {
			onError()
		}
	})
	return {
		close() {
			stream.close()
		},
	}
}
