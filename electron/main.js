/* eslint-disable ts/no-floating-promises */
/* eslint-disable ts/naming-convention */

import { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } from 'electron'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Vite default dev & production ports
const sveltePort = app.isPackaged ? '4173' : '5173'
const SVELTE_HOST = '127.0.0.1'
app.setName('AllWork')

function createWindow() {
	const mainWindow = new BrowserWindow({
		height: 1024,
		minHeight: 640,
		minWidth: 800,
		title: 'AllWork',
		webPreferences: {
			contextIsolation: true,
			preload: fileURLToPath(new URL('preload.cjs', import.meta.url)),
		},
		width: 1440,
	})

	console.log('window created')

	mainWindow.menuBarVisible = false // Windows: hides the menu bar
	mainWindow.loadURL(`http://${SVELTE_HOST}:${sveltePort}`)

	// Intercept new window events (e.g., links with target="_blank")
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		// Open the url in the default browser
		shell.openExternal(url)
		// Prevent Electron from opening a new window
		return { action: 'deny' }
	})

	// Intercept navigation events within the current window

	mainWindow.webContents.on('will-navigate', (event, url) => {
		// If the url is different from the app's url, open in default browser

		if (
			!url.startsWith('file://') &&
			!url.startsWith('gittower://') &&
			!url.startsWith('vscode://') &&
			url === mainWindow.webContents.getURL()
		) {
			return
		}

		event.preventDefault()

		// All other protocols handled
		shell.openExternal(url)
	})
}

/**
 * Checks if the server is available.
 *
 * @param {number} port - The port number.
 *
 * @returns {Promise<void>}
 */
async function checkServerAvailability(port) {
	const MAX_RETRIES = 10
	const RETRY_INTERVAL_IN_MS = 1000

	return new Promise((resolve, reject) => {
		let retries = 0

		function tryConnection() {
			const socket = new net.Socket()

			const onError = () => {
				socket.destroy()

				if (retries >= MAX_RETRIES) {
					reject(new Error(`Couldn't connect to SvelteKit server after ${MAX_RETRIES} attempts`))
				} else {
					retries++
					setTimeout(tryConnection, RETRY_INTERVAL_IN_MS)
				}
			}

			socket.setTimeout(1000)
			socket.once('error', onError)
			socket.once('timeout', onError)

			socket.connect(port, SVELTE_HOST, () => {
				socket.destroy()
				resolve()
			})
		}

		tryConnection()
	})
}

async function startApp() {
	try {
		await app.whenReady()
		ipcMain.handle('allwork:choose-directory', async (event) => {
			if (
				event.senderFrame?.url === undefined ||
				new URL(event.senderFrame.url).origin !== `http://${SVELTE_HOST}:${sveltePort}`
			) {
				throw new Error('Directory picker is only available inside AllWork.')
			}

			const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
			return result.canceled ? undefined : result.filePaths[0]
		})
		if (app.isPackaged) {
			utilityProcess.fork(path.join(app.getAppPath(), 'electron', 'server.js'), {
				// @ts-expect-error - string[] index
				env: {
					...process.env,
					ALLWORK_SETTINGS_DIRECTORY:
						process.env.ALLWORK_SETTINGS_DIRECTORY ?? app.getPath('userData'),
					HOST: SVELTE_HOST,
					PORT: sveltePort,
				},
			})
		} else {
			console.warn('##### Running Electron in development mode')
			console.log('##### Run `npm run dev` to start the SvelteKit server separately')
		}

		await checkServerAvailability(Number(sveltePort))
		createWindow()
	} catch (error) {
		dialog.showErrorBox('Error', error instanceof Error ? error.message : String(error))
		app.quit()
	}
}

void startApp()

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
})

// Open a window if none are open in macOS
app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow()
	}
})
