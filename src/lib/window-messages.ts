import type { OutputNeighbors, OutputTarget } from './app-windows.js'
import type { Preferences } from './preferences.js'
import { asRecord, parsePreferences } from './preferences.js'

/** Messages exchanged between the main page and its secondary windows. */
export type WindowMessage =
	| (OutputNeighbors & { repositoryId: string; runId: string; type: 'output-neighbors' })
	| { clearHistory: boolean; type: 'reset-view' }
	| { preferences: Preferences; type: 'preferences-changed' }
	| { repositoryId: string; runId: string; type: 'output-neighbors-request' }
	| { runId: string; type: 'run-removed' }

const CHANNEL = 'allwork-windows'

function isString(value: unknown): value is string {
	return typeof value === 'string'
}

function parseOutputTarget(value: unknown): OutputTarget | undefined {
	const record = asRecord(value)
	return record !== undefined &&
		isString(record.name) &&
		isString(record.path) &&
		isString(record.repositoryId) &&
		isString(record.runId)
		? {
				name: record.name,
				path: record.path,
				repositoryId: record.repositoryId,
				runId: record.runId,
			}
		: undefined
}

function parseWindowMessage(value: unknown): undefined | WindowMessage {
	const record = asRecord(value)
	switch (record?.type) {
		case 'output-neighbors': {
			return isString(record.repositoryId) && isString(record.runId)
				? {
						next: parseOutputTarget(record.next),
						previous: parseOutputTarget(record.previous),
						repositoryId: record.repositoryId,
						runId: record.runId,
						type: 'output-neighbors',
					}
				: undefined
		}

		case 'output-neighbors-request': {
			return isString(record.repositoryId) && isString(record.runId)
				? {
						repositoryId: record.repositoryId,
						runId: record.runId,
						type: 'output-neighbors-request',
					}
				: undefined
		}

		case 'preferences-changed': {
			return { preferences: parsePreferences(record.preferences), type: 'preferences-changed' }
		}

		case 'reset-view': {
			return { clearHistory: record.clearHistory === true, type: 'reset-view' }
		}

		case 'run-removed': {
			return typeof record.runId === 'string'
				? { runId: record.runId, type: 'run-removed' }
				: undefined
		}

		default: {
			return undefined
		}
	}
}

/** Notify the other AllWork windows of this origin. The sender is not notified. */
export function postWindowMessage(message: WindowMessage): void {
	const channel = new BroadcastChannel(CHANNEL)
	channel.postMessage(message)
	channel.close()
}

/**
 * Receive messages from the other AllWork windows until the returned function
 * is called.
 */
export function listenForWindowMessages(listener: (message: WindowMessage) => void): () => void {
	const channel = new BroadcastChannel(CHANNEL)
	channel.addEventListener('message', (event: MessageEvent) => {
		const message = parseWindowMessage(event.data)
		if (message !== undefined) {
			listener(message)
		}
	})
	return () => {
		channel.close()
	}
}
