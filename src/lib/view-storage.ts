import type { Preferences } from './preferences.js'
import { asRecord, parsePreferences } from './preferences.js'

export type SavedView = {
	autoClear: boolean
	autoClearPredecessors: Record<string, string>
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

type LocalStore = Pick<Window['localStorage'], 'getItem' | 'removeItem' | 'setItem'>

const preferencesKey = 'allwork.preferences.v1'
const viewKey = 'allwork.view.v1'
const legacyKeys = ['directory', 'recursive', 'autoClear', 'outputLines', 'commandHistory']

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

function readJson(storage: LocalStore, key: string): unknown {
	try {
		return JSON.parse(storage.getItem(key) ?? 'null') as unknown
	} catch {
		return undefined
	}
}

/** Load preferences and migrate the original individual view keys. */
export function loadLocalState(storage: LocalStore, defaultDirectory: string) {
	const saved = readJson(storage, viewKey)
	const legacy = saved ?? {
		autoClear: storage.getItem('allwork.autoClear') === 'true',
		commandHistory: readJson(storage, 'allwork.commandHistory'),
		directory: storage.getItem('allwork.directory') ?? defaultDirectory,
		outputLines: Number(storage.getItem('allwork.outputLines') ?? 3),
		recursive: storage.getItem('allwork.recursive') !== 'false',
	}
	return {
		preferences: parsePreferences(readJson(storage, preferencesKey)),
		view: parseSavedView(legacy, defaultDirectory),
	}
}

/** Save preferences immediately so template identity survives relaunches. */
export function savePreferences(storage: LocalStore, preferences: Preferences) {
	storage.setItem(preferencesKey, JSON.stringify(preferences))
}

/**
 * Debounce small view snapshots and flush them synchronously when the page
 * closes.
 */
export function createViewWriter(storage: LocalStore, onError: () => void) {
	let pending: SavedView | undefined
	let timer: ReturnType<typeof setTimeout> | undefined
	function flush() {
		clearTimeout(timer)
		timer = undefined
		if (pending === undefined) {
			return
		}

		storage.setItem(viewKey, JSON.stringify(pending))
		pending = undefined
	}

	return {
		flush,
		queue(view: SavedView) {
			pending = view
			clearTimeout(timer)
			timer = setTimeout(() => {
				try {
					flush()
				} catch {
					onError()
				}
			}, 200)
		},
		reset() {
			clearTimeout(timer)
			pending = undefined
			storage.removeItem(viewKey)
			for (const key of legacyKeys) {
				storage.removeItem(`allwork.${key}`)
			}
		},
	}
}
