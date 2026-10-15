const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('_allwork', {
	async chooseDirectory() {
		/** @type {unknown} */
		const result = await ipcRenderer.invoke('allwork:choose-directory')
		return typeof result === 'string' ? result : undefined
	},
})
