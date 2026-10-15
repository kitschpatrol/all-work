import type { Repository } from './workspace.js'

/** Coalesce arriving metadata into one table update per batch. */
export function watchWorkspaceMetadata(
	id: string,
	onRows: (rows: Repository[], snapshot: boolean) => void,
	onError: () => void,
) {
	// eslint-disable-next-line node/no-unsupported-features/node-builtins -- This EventSource runs in the browser.
	const stream = new EventSource(`/api/workspace/events?id=${id}`)
	const pending = new Map<string, Repository>()
	let snapshot = false
	let timer: ReturnType<typeof setTimeout> | undefined
	stream.addEventListener('message', (message) => {
		const event = JSON.parse(String(message.data)) as {
			repositories?: Repository[]
			repository?: Repository
			snapshot?: boolean
		}
		if (event.repositories !== undefined && event.snapshot !== false) {
			pending.clear()
			snapshot = true
		}

		const rows = event.repositories ?? (event.repository === undefined ? [] : [event.repository])
		for (const repository of rows) {
			pending.set(repository.id, repository)
		}

		timer ??= setTimeout(() => {
			timer = undefined
			const batch = pending.values().toArray()
			const replace = snapshot
			pending.clear()
			snapshot = false
			onRows(batch, replace)
		}, 150)
	})
	stream.addEventListener('error', () => {
		if (stream.readyState === 2) {
			onError()
		}
	})
	return {
		close() {
			clearTimeout(timer)
			pending.clear()
			stream.close()
		},
	}
}
