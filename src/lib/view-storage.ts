import type { DockedColumns } from './column-order.js'
import type { ColumnPresetId } from './column-presets.js'
import type { FilterPresetId } from './filter-presets.js'
import type { Preferences } from './preferences.js'
import type { FilterGroup } from './row-filter.js'
import { request } from './client-request.js'
import { isColumnPresetId } from './column-presets.js'
import { isFilterPresetId } from './filter-presets.js'
import { asRecord, parsePreferences } from './preferences.js'
import { parseFilter } from './row-filter.js'

export type SavedView = {
	autoClear: boolean
	autoClearPredecessors: Record<string, string>
	/** Runs whose columns were cleared while filter rules still read them. */
	clearedRunIds: string[]
	/** Columns docked at either table edge, in dock order. */
	columnDocking: DockedColumns
	columnOrder: string[]
	columnPreset: ColumnPresetId | undefined
	columnSizing: Record<string, number>
	columnVisibility: Record<string, boolean>
	command: string
	commandHistory: string[]
	concurrency: number
	directory: string
	filter: FilterGroup
	filterPreset: FilterPresetId | undefined
	nextRunNumber: number
	outputLines: number
	recursive: boolean
	resizedColumns: string[]
	rowSelection: Record<string, boolean>
	runIds: string[]
	/** Run columns that sort by exit code rather than output. */
	runsSortedByExitCode: string[]
	search: string
	selectedOnly: boolean
	sorting: Array<{ desc: boolean; id: string }>
	version: 1
	workspaceDirectory?: string
}

function strings(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((entry: unknown): entry is string => typeof entry === 'string')
		: []
}

// Every saved count starts at 1
function count(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER) {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= max
		? value
		: fallback
}

/**
 * A view saved before docking existed keeps the repository column at the left
 * edge and its newest run at the right, as the table always showed them.
 */
function parseDocking(value: unknown, runIds: string[]): DockedColumns {
	const record = asRecord(value)
	if (record === undefined) {
		return { start: ['relativePath'], end: runIds.slice(-1) }
	}

	const start = strings(record.start)
	const end = strings(record.end).filter((id) => !start.includes(id))
	return { start, end }
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
	return {
		autoClear: record.autoClear === true,
		autoClearPredecessors: Object.fromEntries(
			Object.entries(asRecord(record.autoClearPredecessors) ?? {}).filter(
				(entry): entry is [string, string] => typeof entry[1] === 'string',
			),
		),
		clearedRunIds: strings(record.clearedRunIds).slice(-1000),
		columnDocking: parseDocking(record.columnDocking, strings(record.runIds)),
		columnOrder: strings(record.columnOrder),
		// A view saved before presets existed, or a fresh one, starts on Default
		columnPreset: isColumnPresetId(record.columnPreset)
			? record.columnPreset
			: record.columnPreset === undefined
				? 'defaults'
				: undefined,
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
		concurrency: count(record.concurrency, 6, 32),
		directory: typeof record.directory === 'string' ? record.directory : defaultDirectory,
		filter: parseFilter(record.filter),
		filterPreset: isFilterPresetId(record.filterPreset) ? record.filterPreset : undefined,
		nextRunNumber: count(record.nextRunNumber, 1),
		outputLines: count(record.outputLines, 3),
		recursive: record.recursive === true,
		resizedColumns: strings(record.resizedColumns),
		rowSelection: booleanRecord(record.rowSelection),
		runIds: strings(record.runIds).slice(-1000),
		runsSortedByExitCode: strings(record.runsSortedByExitCode),
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
		version: 1,
		workspaceDirectory:
			typeof record.workspaceDirectory === 'string' ? record.workspaceDirectory : undefined,
	}
}

/** Load the shared JSON settings through the local All Work server. */
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
