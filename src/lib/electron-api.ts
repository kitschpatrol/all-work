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

/** The bridge the Electron preload script exposes to the renderer as `_allwork`. */
export type AllWorkApi = {
	chooseDirectory: () => Promise<string | undefined>
	onMenuCommand: (callback: (command: MenuCommand, payload?: string) => void) => () => void
	updateMenuState: (state: MenuState) => void
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
