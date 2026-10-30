import type { ColumnPreset, ColumnPresetId } from './column-presets.js'
import type { FilterPreset, FilterPresetId } from './filter-presets.js'
import { isColumnPresetId } from './column-presets.js'
import { isFilterPresetId } from './filter-presets.js'
import { asRecord } from './record.js'

/**
 * Application menu commands sent from the Electron main process to the
 * renderer.
 */
export type MenuCommand =
	| 'column.clearFinishedLeft'
	| 'column.clearFinishedRight'
	| 'column.copy'
	| 'column.copySelected'
	| 'column.copyVariable'
	| 'column.filter'
	| 'column.hide'
	| 'column.show'
	| 'column.sortAscending'
	| 'column.sortDescending'
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
	| 'view.clearFilter'
	| 'view.columnPreset'
	| 'view.columns'
	| 'view.filterPreset'
	| 'view.fitColumns'
	| 'view.focusSearch'
	| 'view.reset'
	| 'view.showFilter'
	| 'view.toggleRepositoryShortcuts'
	| 'view.toggleSelectedOnly'
	| 'workspace.browse'
	| 'workspace.reload'

/** Renderer-side handlers for each menu command. */
export type MenuActions = Record<MenuCommand, (payload?: string) => void>

const openTargets = ['finder', 'github', 'readme', 'terminal', 'tower', 'vscode'] as const
/** Applications the Repositories menu can open selected repositories in. */
export type OpenTarget = (typeof openTargets)[number]

/** An item chosen from a repository's context menu. */
export type RepositoryMenuChoice = 'copyPath' | 'refresh' | 'website' | OpenTarget

/** Which of a repository's context menu items can be used. */
export type RepositoryMenuRequest = {
	hasGithubRemote: boolean
	hasReadme: boolean
	hasWebsite: boolean
}

/**
 * Renderer state the main process needs to enable, disable, and check menu
 * items.
 */
export type MenuState = {
	autoClear: boolean
	canReload: boolean
	canRun: boolean
	columnPreset: ColumnPresetId | undefined
	columnPresets: Array<Pick<ColumnPreset, 'id' | 'label'>>
	filterActive: boolean
	filterPreset: FilterPresetId | undefined
	filterPresets: Array<Pick<FilterPreset, 'id' | 'label'>>
	hasActiveRuns: boolean
	hasFinishedRuns: boolean
	loading: boolean
	selectedCount: number
	selectedOnly: boolean
	showRepositoryShortcuts: boolean
	visibleCount: number
}

/**
 * A secondary window the renderer asks Electron to open, sized by the caller. A
 * window already showing the same address is brought forward instead.
 */
export type AppWindowRequest = {
	height: number
	resizable: boolean
	url: string
	width: number
}

/** Available actions for the column whose native context menu is opening. */
export type ColumnMenuRequest = {
	canFilter: boolean
	canHide: boolean
	canSort: boolean
	columnId: string
	hasFinishedRunsLeft: boolean
	hasFinishedRunsRight: boolean
	hasSelection: boolean
	hasVariable: boolean
	isRun: boolean
}

/** Hidden columns offered to show again, grouped by category in column order. */
export type HiddenColumnsMenuRequest = {
	groups: Array<{ category: string; columns: Array<{ id: string; label: string }> }>
}

/** The bridge the Electron preload script exposes to the renderer as `_allWork`. */
export type AllWorkApi = {
	chooseDirectory: () => Promise<string | undefined>
	onMenuCommand: (callback: (command: MenuCommand, payload?: string) => void) => () => void
	openWindow: (request: AppWindowRequest) => Promise<void>
	showColumnMenu: (request: ColumnMenuRequest) => Promise<void>
	showHiddenColumnsMenu: (request: HiddenColumnsMenuRequest) => Promise<void>
	showRepositoryMenu: (request: RepositoryMenuRequest) => Promise<RepositoryMenuChoice | undefined>
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
		typeof request.resizable === 'boolean' &&
		typeof request.url === 'string' &&
		request.url.startsWith('/') &&
		!request.url.startsWith('//') &&
		typeof request.width === 'number' &&
		request.width >= 200 &&
		request.width <= 4000
	)
}

/**
 * Validate column actions requested by the renderer before opening a native
 * menu.
 */
export function isColumnMenuRequest(value: unknown): value is ColumnMenuRequest {
	if (typeof value !== 'object' || value === null) {
		return false
	}

	const request = value as Record<keyof ColumnMenuRequest, unknown>
	return (
		typeof request.columnId === 'string' &&
		request.columnId !== '' &&
		typeof request.canFilter === 'boolean' &&
		typeof request.canHide === 'boolean' &&
		typeof request.canSort === 'boolean' &&
		typeof request.hasFinishedRunsLeft === 'boolean' &&
		typeof request.hasFinishedRunsRight === 'boolean' &&
		typeof request.hasSelection === 'boolean' &&
		typeof request.hasVariable === 'boolean' &&
		typeof request.isRun === 'boolean'
	)
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value !== ''
}

/** Validate the hidden columns listed in a menu request arriving over IPC. */
export function isHiddenColumnsMenuRequest(value: unknown): value is HiddenColumnsMenuRequest {
	const groups = asRecord(value)?.groups
	return (
		Array.isArray(groups) &&
		groups.every((entry: unknown) => {
			const group = asRecord(entry)
			return (
				isNonEmptyString(group?.category) &&
				Array.isArray(group.columns) &&
				group.columns.length > 0 &&
				group.columns.every((item: unknown) => {
					const column = asRecord(item)
					return isNonEmptyString(column?.id) && isNonEmptyString(column.label)
				})
			)
		})
	)
}

/** Narrow a menu payload to an application the selection can be opened in. */
export function isOpenTarget(value: unknown): value is OpenTarget {
	return openTargets.includes(value as OpenTarget)
}

/** Narrow the item returned by a repository's context menu. */
export function isRepositoryMenuChoice(value: unknown): value is RepositoryMenuChoice {
	return value === 'copyPath' || value === 'refresh' || value === 'website' || isOpenTarget(value)
}

/** Validate a repository context menu request arriving over IPC. */
export function isRepositoryMenuRequest(value: unknown): value is RepositoryMenuRequest {
	const request = asRecord(value)
	return (
		typeof request?.hasGithubRemote === 'boolean' &&
		typeof request.hasReadme === 'boolean' &&
		typeof request.hasWebsite === 'boolean'
	)
}

// Built-in presets plus up to 100 saved ones, each with a short visible label
function isPresetList(value: unknown, isId: (id: unknown) => boolean): boolean {
	return (
		Array.isArray(value) &&
		value.length <= 102 &&
		value.every((entry: unknown) => {
			const preset = asRecord(entry)
			return (
				preset !== undefined &&
				isId(preset.id) &&
				typeof preset.label === 'string' &&
				preset.label !== '' &&
				preset.label.length <= 80
			)
		})
	)
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
		(state.columnPreset === undefined || isColumnPresetId(state.columnPreset)) &&
		isPresetList(state.columnPresets, isColumnPresetId) &&
		typeof state.filterActive === 'boolean' &&
		(state.filterPreset === undefined || isFilterPresetId(state.filterPreset)) &&
		isPresetList(state.filterPresets, isFilterPresetId) &&
		typeof state.hasActiveRuns === 'boolean' &&
		typeof state.hasFinishedRuns === 'boolean' &&
		typeof state.loading === 'boolean' &&
		typeof state.selectedCount === 'number' &&
		typeof state.selectedOnly === 'boolean' &&
		typeof state.showRepositoryShortcuts === 'boolean' &&
		typeof state.visibleCount === 'number'
	)
}
