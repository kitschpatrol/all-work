import type { Preferences } from './preferences.js'
import { request } from './client-request.js'
import { asRecord, parsePreferences } from './preferences.js'

export type SavedView = {
	autoClear: boolean
	autoClearPredecessors: Record<string, string>
	columnOrder: string[]
	columnSizing: Record<string, number>
	columnVisibility: Record<string, boolean>
	command: string
	commandHistory: string[]
	concurrency: number
	directory: string
	outputLines: number
	recursive: boolean
	resizedColumns: string[]
	rowSelection: Record<string, boolean>
	runIds: string[]
	scroll: { left: number; top: number }
	search: string
	selectedOnly: boolean
	sorting: Array<{ desc: boolean; id: string }>
	status: 'all' | 'clean' | 'dirty'
	version: 1
	workspaceDirectory?: string
}

function strings(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((entry: unknown): entry is string => typeof entry === 'string')
		: []
}

function integer(value: unknown, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER) {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
		? value
		: fallback
}

function booleanRecord(value: unknown): Record<string, boolean> {
	return Object.fromEntries(
		Object.entries(asRecord(value) ?? {}).filter(
			(entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
		),
	)
}

/** Restore all durable toolbar and table state from a versioned snapshot. */
export function parseSavedView(value: unknown, defaultDirectory: string): SavedView {
	const record = asRecord(value) ?? {}
	const scroll = asRecord(record.scroll)
	return {
		autoClear: record.autoClear === true,
		autoClearPredecessors: Object.fromEntries(
			Object.entries(asRecord(record.autoClearPredecessors) ?? {}).filter(
				(entry): entry is [string, string] => typeof entry[1] === 'string',
			),
		),
		columnOrder: strings(record.columnOrder),
		columnSizing: Object.fromEntries(
			Object.entries(asRecord(record.columnSizing) ?? {}).filter(
				(entry): entry is [string, number] =>
					typeof entry[1] === 'number' &&
					Number.isFinite(entry[1]) &&
					entry[1] >= 24 &&
					entry[1] <= 4000,
			),
		),
		columnVisibility: booleanRecord(record.columnVisibility),
		command: typeof record.command === 'string' ? record.command : '',
		commandHistory: strings(record.commandHistory).slice(-100),
		concurrency: integer(record.concurrency, 6, 1, 32),
		directory: typeof record.directory === 'string' ? record.directory : defaultDirectory,
		outputLines: integer(record.outputLines, 3, 1),
		recursive: record.recursive !== false,
		resizedColumns: strings(record.resizedColumns),
		rowSelection: booleanRecord(record.rowSelection),
		runIds: strings(record.runIds).slice(-1000),
		scroll: { left: integer(scroll?.left, 0, 0), top: integer(scroll?.top, 0, 0) },
		search: typeof record.search === 'string' ? record.search : '',
		selectedOnly: record.selectedOnly === true,
		sorting: Array.isArray(record.sorting)
			? record.sorting.flatMap((entry: unknown) => {
					const sort = asRecord(entry)
					return typeof sort?.id === 'string' && typeof sort.desc === 'boolean'
						? { desc: sort.desc, id: sort.id }
						: []
				})
			: [{ desc: false, id: 'relativePath' }],
		status: record.status === 'clean' || record.status === 'dirty' ? record.status : 'all',
		version: 1,
		workspaceDirectory:
			typeof record.workspaceDirectory === 'string' ? record.workspaceDirectory : undefined,
	}
}

/** Load the shared JSON settings through the local AllWork server. */
export async function loadSettings(defaultDirectory: string) {
	const saved = asRecord(await request<unknown>('/api/settings', {}))
	return {
		preferences: parsePreferences(saved?.preferences),
		view: parseSavedView(saved?.view, defaultDirectory),
	}
}

/** Save identity preferences independently of the frequently updated view. */
export async function savePreferences(preferences: Preferences) {
	await request('/api/settings', { kind: 'preferences', value: preferences }, 'PUT')
}

/** Debounce view writes and send the latest snapshot when the page closes. */
export function createViewWriter(onError: () => void) {
	const id = crypto.randomUUID()
	let sequence = 0
	let pending: SavedView | undefined
	let timer: ReturnType<typeof setTimeout> | undefined
	let resetting = false
	const active = new Set<Promise<unknown>>()
	function failed(value: SavedView) {
		if (!resetting) {
			pending ??= value
		}

		onError()
	}

	async function flush(keepalive = false) {
		clearTimeout(timer)
		timer = undefined
		if (pending === undefined || resetting) {
			return
		}

		const value = pending
		pending = undefined
		const write = request<unknown>(
			'/api/settings',
			{ kind: 'view', value, writer: { id, sequence: ++sequence } },
			'PUT',
			{ keepalive },
		)
		active.add(write)
		try {
			await write
		} catch {
			failed(value)
		} finally {
			active.delete(write)
		}
	}

	return {
		flush,
		queue(view: SavedView) {
			if (resetting) {
				return
			}

			pending = view
			clearTimeout(timer)
			timer = setTimeout(() => {
				void flush()
			}, 200)
		},
		async reset() {
			resetting = true
			clearTimeout(timer)
			pending = undefined
			try {
				await Promise.allSettled(active)
				await request(
					'/api/settings',
					{ kind: 'view', writer: { id, sequence: ++sequence } },
					'DELETE',
				)
			} finally {
				resetting = false
			}
		},
	}
}
