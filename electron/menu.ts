import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { app, Menu, shell, webContents } from 'electron'
import type { MenuCommand, MenuState } from '../src/lib/electron-api.js'
import { homepageUrl } from '../src/lib/app-links.js'
import {
	defaultColumnPreset,
	isBasicColumnPreset,
	resolveColumnPresets,
} from '../src/lib/column-presets.js'
import { commandPresets } from '../src/lib/command-presets.js'
import { filterPresets } from '../src/lib/filter-presets.js'

const builtinColumnPresets = resolveColumnPresets([], [])

export const initialMenuState: MenuState = {
	autoClear: false,
	canReload: false,
	canRun: false,
	columnPreset: defaultColumnPreset.id,
	columnPresets: builtinColumnPresets.map(({ id, label }) => ({ id, label })),
	filterActive: false,
	filterPreset: undefined,
	filterPresets: filterPresets.map(({ id, label }) => ({ id, label })),
	hasActiveRuns: false,
	hasFinishedRuns: false,
	loading: false,
	selectedCount: 0,
	selectedOnly: false,
	showRepositoryShortcuts: false,
	visibleCount: 0,
}

type Send = (command: MenuCommand, payload?: string) => void

const separator: MenuItemConstructorOptions = { type: 'separator' }

function buildTemplate(
	state: MenuState,
	send: Send,
	selectAll: () => void,
	showAbout: () => void,
): MenuItemConstructorOptions[] {
	const isMac = process.platform === 'darwin'

	function item(
		label: string,
		command: MenuCommand,
		{ payload, ...options }: MenuItemConstructorOptions & { payload?: string } = {},
	): MenuItemConstructorOptions {
		return {
			click() {
				send(command, payload)
			},
			label,
			...options,
		}
	}

	function columnPresetItem(preset: MenuState['columnPresets'][number]) {
		return item(preset.label, 'view.columnPreset', {
			checked: state.columnPreset === preset.id,
			payload: preset.id,
			toolTip: builtinColumnPresets.find((entry) => entry.id === preset.id)?.description,
			type: 'checkbox',
		})
	}

	const preferences = item('Preferences…', 'preferences.open', { accelerator: 'CmdOrCtrl+,' })
	const canChangeWorkspace = !state.loading && !state.hasActiveRuns
	const canRefresh = state.selectedCount > 0 && !state.loading
	const canOpenSelected = state.selectedCount > 0

	const appMenu: MenuItemConstructorOptions = {
		label: app.name,
		submenu: [
			{ click: showAbout, label: `About ${app.name}` },
			separator,
			preferences,
			separator,
			{ role: 'services' },
			separator,
			{ role: 'hide' },
			{ role: 'hideOthers' },
			{ role: 'unhide' },
			separator,
			{ role: 'quit' },
		],
	}

	const file: MenuItemConstructorOptions = {
		label: 'File',
		submenu: [
			item('Open Workspace…', 'workspace.browse', {
				accelerator: 'CmdOrCtrl+O',
				enabled: canChangeWorkspace,
			}),
			item('Reload Workspace', 'workspace.reload', {
				accelerator: 'CmdOrCtrl+R',
				enabled: state.canReload,
			}),
			separator,
			...(isMac
				? [{ role: 'close' as const }]
				: [preferences, separator, { role: 'quit' as const }]),
		],
	}

	const edit: MenuItemConstructorOptions = {
		label: 'Edit',
		submenu: [
			{ role: 'undo' },
			{ role: 'redo' },
			separator,
			{ role: 'cut' },
			{ role: 'copy' },
			{ role: 'paste' },
			{ role: 'delete' },
			{ accelerator: 'CmdOrCtrl+A', click: selectAll, label: 'Select All' },
			separator,
			item('Search Repositories…', 'view.focusSearch', { accelerator: 'CmdOrCtrl+F' }),
		],
	}

	const command: MenuItemConstructorOptions = {
		label: 'Command',
		submenu: [
			item('Run', 'command.run', { accelerator: 'CmdOrCtrl+Return', enabled: state.canRun }),
			item('Stop All', 'command.stopAll', {
				accelerator: 'CmdOrCtrl+.',
				enabled: state.hasActiveRuns,
			}),
			separator,
			item('Go to Command Field', 'command.focus', { accelerator: 'CmdOrCtrl+L' }),
			{
				label: 'Presets',
				submenu: commandPresets.map((preset) =>
					item(preset.label, 'command.preset', { payload: preset.command }),
				),
			},
			separator,
			item('Clear Finished Runs', 'runs.clearFinished', {
				accelerator: 'CmdOrCtrl+K',
				enabled: state.hasFinishedRuns,
			}),
			item('Auto Clear', 'runs.toggleAutoClear', { checked: state.autoClear, type: 'checkbox' }),
		],
	}

	const repositories: MenuItemConstructorOptions = {
		label: 'Repositories',
		submenu: [
			item('Select All Matching', 'repositories.selectAll', {
				enabled: state.visibleCount > 0,
			}),
			item('Select Repositories with Changes', 'repositories.selectChanged', {
				enabled: state.visibleCount > 0,
			}),
			item('Deselect All', 'repositories.deselectAll', {
				accelerator: 'Alt+CmdOrCtrl+A',
				enabled: state.selectedCount > 0,
			}),
			separator,
			item('Refresh Metadata for Selected', 'metadata.refresh', {
				accelerator: 'Shift+CmdOrCtrl+R',
				enabled: canRefresh,
			}),
			item('Check Dependencies for Selected', 'metadata.checkDependencies', {
				enabled: canRefresh,
			}),
			separator,
			{
				enabled: canOpenSelected,
				label: 'Open Selected In',
				submenu: [
					item('Readme', 'repositories.open', { payload: 'readme' }),
					item('Tower', 'repositories.open', { payload: 'tower' }),
					item('VS Code', 'repositories.open', { payload: 'vscode' }),
					item('GitHub', 'repositories.open', { payload: 'github' }),
					item('Terminal', 'repositories.open', { payload: 'terminal' }),
				],
			},
			item('Reveal Selected in Finder', 'repositories.open', {
				enabled: canOpenSelected,
				payload: 'finder',
			}),
		],
	}

	const view: MenuItemConstructorOptions = {
		label: 'View',
		submenu: [
			item('Show Repo Shortcut Buttons', 'view.toggleRepositoryShortcuts', {
				checked: state.showRepositoryShortcuts,
				type: 'checkbox',
			}),
			item('Show Selected Only', 'view.toggleSelectedOnly', {
				checked: state.selectedOnly,
				type: 'checkbox',
			}),
			{
				label: 'Filter',
				submenu: [
					item('Show Filter Rules', 'view.showFilter', { accelerator: 'Alt+CmdOrCtrl+F' }),
					separator,
					...state.filterPresets.map((preset) =>
						item(preset.label, 'view.filterPreset', {
							checked: state.filterPreset === preset.id,
							payload: preset.id,
							toolTip: filterPresets.find((entry) => entry.id === preset.id)?.description,
							type: 'checkbox',
						}),
					),
					separator,
					item('Clear Filter', 'view.clearFilter', { enabled: state.filterActive }),
				],
			},
			separator,
			{
				label: 'Columns',
				submenu: [
					item('Show All', 'view.columns', { payload: 'all' }),
					item('Hide All Optional', 'view.columns', { payload: 'none' }),
					separator,
					...state.columnPresets
						.filter((preset) => isBasicColumnPreset(preset.id))
						.map((preset) => columnPresetItem(preset)),
					separator,
					...state.columnPresets
						.filter((preset) => !isBasicColumnPreset(preset.id))
						.map((preset) => columnPresetItem(preset)),
				],
			},
			item('Fit Columns to Contents', 'view.fitColumns'),
			item('Reset View', 'view.reset'),
			separator,
			{ role: 'resetZoom' },
			{ role: 'zoomIn' },
			{ role: 'zoomOut' },
			separator,
			{ role: 'togglefullscreen' },
			...(app.isPackaged ? [] : [separator, { role: 'toggleDevTools' as const }]),
		],
	}

	const help: MenuItemConstructorOptions = {
		role: 'help',
		submenu: [
			{
				click() {
					void shell.openExternal(`${homepageUrl}#readme`)
				},
				label: 'All Work Help',
			},
			{
				click() {
					void shell.openExternal(`${homepageUrl}/issues`)
				},
				label: 'Report an Issue…',
			},
		],
	}

	return [
		...(isMac ? [appMenu] : []),
		file,
		edit,
		command,
		repositories,
		view,
		{ role: 'windowMenu' },
		help,
	]
}

/**
 * Install the application menu, enabling and checking items to match the
 * renderer's current state. Call again whenever the state changes.
 *
 * @param state The renderer's current menu state.
 * @param getWindow The main window, which receives menu commands.
 * @param showAbout Opens the About window.
 */
export function syncMenu(
	state: MenuState,
	getWindow: () => BrowserWindow | undefined,
	showAbout: () => void,
): void {
	const send: Send = (command, payload) => {
		getWindow()?.webContents.send('all-work:menu-command', command, payload)
	}

	// The main window decides between its text fields and its rows; other windows select text
	const selectAll = () => {
		const focused = webContents.getFocusedWebContents()
		if (focused === null || focused === getWindow()?.webContents) {
			send('edit.selectAll')
		} else {
			focused.selectAll()
		}
	}

	Menu.setApplicationMenu(Menu.buildFromTemplate(buildTemplate(state, send, selectAll, showAbout)))
}
