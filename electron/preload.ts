import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('_allwork', {
	async chooseDirectory(): Promise<string | undefined> {
		const result: unknown = await ipcRenderer.invoke('allwork:choose-directory')
		return typeof result === 'string' ? result : undefined
	},
})
