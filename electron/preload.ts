import { contextBridge, ipcRenderer } from 'electron'
import type {
	AllWorkApi,
	AppWindowRequest,
	ColumnMenuRequest,
	HiddenColumnsMenuRequest,
	MenuCommand,
	MenuState,
	RepositoryMenuChoice,
	RepositoryMenuRequest,
} from '../src/lib/electron-api.js'
import { isRepositoryMenuChoice } from '../src/lib/electron-api.js'

const api: AllWorkApi = {
	async chooseDirectory(): Promise<string | undefined> {
		const result: unknown = await ipcRenderer.invoke('all-work:choose-directory')
		return typeof result === 'string' ? result : undefined
	},
	onMenuCommand(callback: (command: MenuCommand, payload?: string) => void): () => void {
		const listener = (
			_event: Electron.IpcRendererEvent,
			command: unknown,
			payload: unknown,
		): void => {
			if (typeof command === 'string') {
				callback(command as MenuCommand, typeof payload === 'string' ? payload : undefined)
			}
		}

		ipcRenderer.on('all-work:menu-command', listener)
		return (): void => {
			ipcRenderer.removeListener('all-work:menu-command', listener)
		}
	},
	async openExternalUrl(url: string): Promise<void> {
		await ipcRenderer.invoke('all-work:open-external-url', url)
	},
	async openWindow(request: AppWindowRequest): Promise<void> {
		await ipcRenderer.invoke('all-work:open-window', request)
	},
	async showColumnMenu(request: ColumnMenuRequest): Promise<void> {
		await ipcRenderer.invoke('all-work:column-menu', request)
	},
	async showHiddenColumnsMenu(request: HiddenColumnsMenuRequest): Promise<void> {
		await ipcRenderer.invoke('all-work:hidden-columns-menu', request)
	},
	async showRepositoryMenu(
		request: RepositoryMenuRequest,
	): Promise<RepositoryMenuChoice | undefined> {
		const result: unknown = await ipcRenderer.invoke('all-work:repository-menu', request)
		return isRepositoryMenuChoice(result) ? result : undefined
	},
	updateMenuState(state: MenuState): void {
		ipcRenderer.send('all-work:menu-state', state)
	},
}

contextBridge.exposeInMainWorld('_allWork', api)
