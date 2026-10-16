import type { SavedView } from './view-storage.js'

/**
 * Application menu commands sent from the Electron main process to the
 * renderer.
 */
export type MenuCommand =
	| 'command.focus'
	| 'command.preset'
	| 'command.run'
	| 'command.stopAll'
	| 'edit.selectAll'
	| 'metadata.checkDependencies'
	| 'metadata.refresh'
	| 'preferences.open'
	| 'repositories.deselectAll'
	| 'repositories.open'
	| 'repositories.selectAll'
	| 'repositories.selectChanged'
	| 'runs.clearFinished'
	| 'runs.toggleAutoClear'
	| 'view.columns'
	| 'view.fitColumns'
	| 'view.focusFilter'
	| 'view.reset'
	| 'view.status'
	| 'view.toggleSelectedOnly'
	| 'workspace.browse'
	| 'workspace.reload'

/** Renderer-side handlers for each menu command. */
export type MenuActions = Record<MenuCommand, (payload?: string) => void>

const columnPresets = ['all', 'defaults', 'none'] as const
/** Column visibility presets available from the View menu. */
export type ColumnPreset = (typeof columnPresets)[number]

const openTargets = ['finder', 'github', 'terminal', 'tower', 'vscode'] as const
/** Applications the Repositories menu can open selected repositories in. */
export type OpenTarget = (typeof openTargets)[number]

const workingTreeStatuses = ['all', 'clean', 'dirty'] as const satisfies Array<SavedView['status']>

/**
 * Renderer state the main process needs to enable, disable, and check menu
 * items.
 */
export type MenuState = {
	autoClear: boolean
	canReload: boolean
	canRun: boolean
	hasActiveRuns: boolean
	hasFinishedRuns: boolean
	loading: boolean
	selectedCount: number
	selectedOnly: boolean
	status: SavedView['status']
	visibleCount: number
}

/** A secondary window the renderer asks Electron to open, sized by the caller. */
export type AppWindowRequest = {
	height: number
	name: string
	resizable: boolean
	url: string
	width: number
}

/** The bridge the Electron preload script exposes to the renderer as `_allwork`. */
export type AllWorkApi = {
	chooseDirectory: () => Promise<string | undefined>
	onMenuCommand: (callback: (command: MenuCommand, payload?: string) => void) => () => void
	openWindow: (request: AppWindowRequest) => Promise<void>
	updateMenuState: (state: MenuState) => void
}

/**
 * Validate a window request arriving over IPC; only same-origin paths may be
 * opened.
 */
export function isAppWindowRequest(value: unknown): value is AppWindowRequest {
	if (typeof value !== 'object' || value === null) {
		return false
	}

	const request = value as Record<keyof AppWindowRequest, unknown>
	return (
		typeof request.height === 'number' &&
		request.height >= 200 &&
		request.height <= 4000 &&
		typeof request.name === 'string' &&
		request.name !== '' &&
		typeof request.resizable === 'boolean' &&
		typeof request.url === 'string' &&
		request.url.startsWith('/') &&
		!request.url.startsWith('//') &&
		typeof request.width === 'number' &&
		request.width >= 200 &&
		request.width <= 4000
	)
}

/** Narrow a menu payload to a column visibility preset. */
export function isColumnPreset(value: unknown): value is ColumnPreset {
	return columnPresets.includes(value as ColumnPreset)
}

/** Narrow a menu payload to an application the selection can be opened in. */
export function isOpenTarget(value: unknown): value is OpenTarget {
	return openTargets.includes(value as OpenTarget)
}

/** Narrow a menu payload to a working tree filter value. */
export function isWorkingTreeStatus(value: unknown): value is SavedView['status'] {
	return workingTreeStatuses.includes(value as SavedView['status'])
}

/** Validate menu state arriving over IPC before the main process acts on it. */
export function isMenuState(value: unknown): value is MenuState {
	if (typeof value !== 'object' || value === null) {
		return false
	}

	const state = value as Record<keyof MenuState, unknown>
	return (
		typeof state.autoClear === 'boolean' &&
		typeof state.canReload === 'boolean' &&
		typeof state.canRun === 'boolean' &&
		typeof state.hasActiveRuns === 'boolean' &&
		typeof state.hasFinishedRuns === 'boolean' &&
		typeof state.loading === 'boolean' &&
		typeof state.selectedCount === 'number' &&
		typeof state.selectedOnly === 'boolean' &&
		isWorkingTreeStatus(state.status) &&
		typeof state.visibleCount === 'number'
	)
}
