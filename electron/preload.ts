import { contextBridge, ipcRenderer } from 'electron'
import type {
	AllWorkApi,
	AppWindowRequest,
	ColumnMenuRequest,
	MenuCommand,
	MenuState,
	OpenTarget,
} from '../src/lib/electron-api.js'
import { isOpenTarget } from '../src/lib/electron-api.js'

const api: AllWorkApi = {
	async chooseDirectory(): Promise<string | undefined> {
		const result: unknown = await ipcRenderer.invoke('allwork:choose-directory')
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

		ipcRenderer.on('allwork:menu-command', listener)
		return (): void => {
			ipcRenderer.removeListener('allwork:menu-command', listener)
		}
	},
	async openWindow(request: AppWindowRequest): Promise<void> {
		await ipcRenderer.invoke('allwork:open-window', request)
	},
	async showColumnMenu(request: ColumnMenuRequest): Promise<void> {
		await ipcRenderer.invoke('allwork:column-menu', request)
	},
	async showRepositoryMenu(hasGithubRemote: boolean): Promise<OpenTarget | undefined> {
		const result: unknown = await ipcRenderer.invoke('allwork:repository-menu', hasGithubRemote)
		return isOpenTarget(result) ? result : undefined
	},
	updateMenuState(state: MenuState): void {
		ipcRenderer.send('allwork:menu-state', state)
	},
}

contextBridge.exposeInMainWorld('_allwork', api)
