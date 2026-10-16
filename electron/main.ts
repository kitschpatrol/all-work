import { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } from 'electron'
import { getJsonFileTransportDestinations, log, setDefaultLogOptions } from 'lognow'
import net from 'node:net'
import path from 'node:path'
import { isMenuState } from '../src/lib/electron-api.js'
import { initialMenuState, syncMenu } from './menu.js'

// The packaged app serves the adapter-node build from a fixed loopback origin.
// In development, electron-vite starts the SvelteKit dev server and reports
// its URL through ELECTRON_RENDERER_URL.
const packagedServer = { host: '127.0.0.1', port: 4173 }

app.setName('AllWork')
setDefaultLogOptions({ logJsonToFile: true, name: 'AllWork' })

// Distinguishes a deliberate shutdown from the server dying underneath us
let isQuitting = false

let mainWindow: BrowserWindow | undefined

function getAppUrl(): URL {
	if (app.isPackaged) {
		return new URL(`http://${packagedServer.host}:${packagedServer.port}`)
	}

	const rendererUrl = process.env.ELECTRON_RENDERER_URL
	if (rendererUrl === undefined || rendererUrl === '') {
		throw new Error(
			'ELECTRON_RENDERER_URL is not set. Start the development app with `pnpm dev:electron`.',
		)
	}

	return new URL(rendererUrl)
}

function createWindow(appUrl: URL): void {
	mainWindow = new BrowserWindow({
		height: 1024,
		minHeight: 640,
		minWidth: 800,
		title: 'AllWork',
		webPreferences: {
			contextIsolation: true,
			preload: path.join(import.meta.dirname, '../preload/preload.cjs'),
		},
		width: 1440,
	})

	log.info('Window created')

	mainWindow.menuBarVisible = false // Windows: hides the menu bar
	void mainWindow.loadURL(appUrl.href)

	// Links that would open a new window open in the default browser instead
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url)
		return { action: 'deny' }
	})

	// Keep navigation inside the app: anything that would leave the current
	// page, including gittower:// and vscode:// links, opens externally
	mainWindow.webContents.on('will-navigate', (event, url) => {
		if (url === mainWindow?.webContents.getURL()) {
			return
		}

		event.preventDefault()
		void shell.openExternal(url)
	})

	mainWindow.on('closed', () => {
		mainWindow = undefined
		syncMenu(initialMenuState, () => mainWindow)
	})
}

/** Only the app's own page may invoke privileged IPC handlers. */
function isTrustedSender(
	event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
	appUrl: URL,
): boolean {
	return (
		event.senderFrame?.url !== undefined && new URL(event.senderFrame.url).origin === appUrl.origin
	)
}

async function waitForServer(host: string, port: number): Promise<void> {
	const MAX_RETRIES = 10
	const RETRY_INTERVAL_IN_MS = 1000

	return new Promise((resolve, reject) => {
		let retries = 0

		function tryConnection(): void {
			const socket = new net.Socket()

			const onError = (): void => {
				socket.destroy()

				if (retries >= MAX_RETRIES) {
					reject(
						new Error(
							`Couldn't connect to the AllWork server at ${host}:${port} after ${MAX_RETRIES} attempts`,
						),
					)
				} else {
					retries++
					setTimeout(tryConnection, RETRY_INTERVAL_IN_MS)
				}
			}

			socket.setTimeout(1000)
			socket.once('error', onError)
			socket.once('timeout', onError)

			socket.connect(port, host, () => {
				socket.destroy()
				resolve()
			})
		}

		tryConnection()
	})
}

function startServer(appUrl: URL): void {
	log.info('Starting the SvelteKit server')

	/* eslint-disable ts/naming-convention -- Environment variable names */
	const server = utilityProcess.fork(path.join(import.meta.dirname, 'server.js'), [], {
		env: {
			...process.env,
			ALLWORK_SETTINGS_DIRECTORY: process.env.ALLWORK_SETTINGS_DIRECTORY ?? app.getPath('userData'),
			HOST: appUrl.hostname,
			PORT: appUrl.port,
		},
	})
	/* eslint-enable ts/naming-convention */

	server.once('exit', (code) => {
		if (isQuitting) {
			return
		}

		dialog.showErrorBox('Error', `The AllWork server exited unexpectedly with code ${code}.`)
		app.quit()
	})
}

async function main(): Promise<void> {
	try {
		await app.whenReady()
		const appUrl = getAppUrl()

		ipcMain.handle('allwork:choose-directory', async (event) => {
			if (!isTrustedSender(event, appUrl)) {
				throw new Error('Directory picker is only available inside AllWork.')
			}

			const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
			return result.canceled ? undefined : result.filePaths[0]
		})

		ipcMain.on('allwork:menu-state', (event, state: unknown) => {
			if (isTrustedSender(event, appUrl) && isMenuState(state)) {
				syncMenu(state, () => mainWindow)
			}
		})

		syncMenu(initialMenuState, () => mainWindow)

		if (app.isPackaged) {
			log.info(`Logging to ${getJsonFileTransportDestinations().join(', ')}`)
			startServer(appUrl)
		} else {
			log.info(`Running in development mode against ${appUrl.href}`)
		}

		await waitForServer(appUrl.hostname, Number(appUrl.port))
		createWindow(appUrl)
	} catch (error) {
		dialog.showErrorBox('Error', error instanceof Error ? error.message : String(error))
		app.quit()
	}
}

void main()

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
})

app.on('before-quit', () => {
	isQuitting = true
})

// Open a window if none are open on macOS
app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow(getAppUrl())
	}
})
