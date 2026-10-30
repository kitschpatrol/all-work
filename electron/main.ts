import type { MenuItemConstructorOptions } from 'electron'
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, utilityProcess } from 'electron'
import { getJsonFileTransportDestinations, log, setDefaultLogOptions } from 'lognow'
import net from 'node:net'
import path from 'node:path'
import type {
	AppWindowRequest,
	MenuCommand,
	RepositoryMenuChoice,
} from '../src/lib/electron-api.js'
import {
	isAppWindowRequest,
	isColumnMenuRequest,
	isHiddenColumnsMenuRequest,
	isMenuState,
	isRepositoryMenuRequest,
} from '../src/lib/electron-api.js'
import { initialMenuState, syncMenu } from './menu.js'
import { openExternalUrl } from './open-url.js'

// The packaged app serves the adapter-node build from a fixed loopback origin.
// In development, electron-vite starts the SvelteKit dev server and reports
// its URL through ELECTRON_RENDERER_URL.
const packagedServer = { host: '127.0.0.1', port: 4173 }

app.setName('All Work')
setDefaultLogOptions({ logJsonToFile: true, name: 'All Work' })

// Distinguishes a deliberate shutdown from the server dying underneath us
let isQuitting = false

let mainWindow: BrowserWindow | undefined
// Preferences and output windows. Output windows step between results, so they
// are found by the address they show now rather than the one they opened with.
const secondaryWindows = new Set<BrowserWindow>()

const webPreferences = {
	contextIsolation: true,
	preload: path.join(import.meta.dirname, '../preload/preload.cjs'),
}

/**
 * Keep navigation inside the app: anything else opens in the default browser or
 * app.
 */
function guardNavigation(window: BrowserWindow): void {
	window.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url)
		return { action: 'deny' }
	})

	window.webContents.on('will-navigate', (event, url) => {
		if (url === window.webContents.getURL()) {
			return
		}

		event.preventDefault()
		void shell.openExternal(url)
	})
}

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
		title: 'All Work',
		webPreferences,
		width: 1440,
	})

	log.info('Window created')

	mainWindow.menuBarVisible = false // Windows: hides the menu bar
	guardNavigation(mainWindow)
	void mainWindow.loadURL(appUrl.href)

	mainWindow.on('closed', () => {
		mainWindow = undefined
		syncMenu(initialMenuState, () => mainWindow)
	})
}

/** The path and query of a URL, with its parameters in a stable order. */
function getAddress(url: string, base: URL): string | undefined {
	const parsed = URL.parse(url, base)
	if (parsed === null) {
		return undefined
	}

	parsed.searchParams.sort()
	return `${parsed.pathname}${parsed.search}`
}

function openSecondaryWindow(appUrl: URL, request: AppWindowRequest): void {
	const address = getAddress(request.url, appUrl)
	const existing = [...secondaryWindows].find(
		(window) => getAddress(window.webContents.getURL(), appUrl) === address,
	)
	if (existing !== undefined) {
		existing.show()
		existing.focus()
		return
	}

	const window = new BrowserWindow({
		fullscreenable: request.resizable,
		height: request.height,
		maximizable: request.resizable,
		minHeight: 240,
		minWidth: 360,
		resizable: request.resizable,
		title: 'All Work',
		webPreferences,
		width: request.width,
	})
	window.menuBarVisible = false
	guardNavigation(window)
	secondaryWindows.add(window)
	window.on('closed', () => {
		secondaryWindows.delete(window)
	})
	void window.loadURL(new URL(request.url, appUrl).href)
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
							`Couldn't connect to the All Work server at ${host}:${port} after ${MAX_RETRIES} attempts`,
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
			ALL_WORK_SETTINGS_DIRECTORY:
				process.env.ALL_WORK_SETTINGS_DIRECTORY ?? app.getPath('userData'),
			HOST: appUrl.hostname,
			PORT: appUrl.port,
		},
	})
	/* eslint-enable ts/naming-convention */

	server.once('exit', (code) => {
		if (isQuitting) {
			return
		}

		dialog.showErrorBox('Error', `The All Work server exited unexpectedly with code ${code}.`)
		app.quit()
	})
}

async function main(): Promise<void> {
	try {
		await app.whenReady()
		const appUrl = getAppUrl()

		ipcMain.handle('all-work:choose-directory', async (event) => {
			if (!isTrustedSender(event, appUrl)) {
				throw new Error('Directory picker is only available inside All Work.')
			}

			const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
			return result.canceled ? undefined : result.filePaths[0]
		})

		ipcMain.handle('all-work:open-external-url', async (event, url: unknown) => {
			if (!isTrustedSender(event, appUrl)) {
				throw new Error('Links can only be opened from inside All Work.')
			}

			await openExternalUrl(url)
		})

		ipcMain.handle('all-work:open-window', (event, request: unknown) => {
			if (!isTrustedSender(event, appUrl)) {
				throw new Error('Windows can only be opened from inside All Work.')
			}

			if (!isAppWindowRequest(request)) {
				throw new Error('Invalid window request.')
			}

			openSecondaryWindow(appUrl, request)
		})

		ipcMain.handle('all-work:column-menu', (event, request: unknown) => {
			if (!isTrustedSender(event, appUrl)) {
				throw new Error('Column menus are only available inside All Work.')
			}

			if (!isColumnMenuRequest(request)) {
				throw new Error('Invalid column.')
			}

			const window = BrowserWindow.fromWebContents(event.sender)
			if (window === null) {
				return
			}

			type ColumnMenuItem = 'separator' | [string, MenuCommand, boolean]
			const runItems: ColumnMenuItem[] = [
				'separator',
				['Clear Finished to Left', 'column.clearFinishedLeft', request.hasFinishedRunsLeft],
				['Clear Finished to Right', 'column.clearFinishedRight', request.hasFinishedRunsRight],
			]
			const items: ColumnMenuItem[] = [
				['Sort Ascending', 'column.sortAscending', request.canSort],
				['Sort Descending', 'column.sortDescending', request.canSort],
				['Hide Column', 'column.hide', request.canHide],
				['Filter By…', 'column.filter', request.canFilter],
				'separator',
				['Copy', 'column.copy', true],
				['Copy Selected', 'column.copySelected', request.hasSelection],
				['Copy Variable', 'column.copyVariable', request.hasVariable],
				...(request.isRun ? runItems : []),
			]
			Menu.buildFromTemplate(
				items.map((item) => {
					if (item === 'separator') {
						return { type: 'separator' } as const
					}

					const [label, command, enabled] = item
					return {
						click() {
							event.sender.send('all-work:menu-command', command, request.columnId)
						},
						enabled,
						label,
					}
				}),
			).popup({ window })
		})

		ipcMain.handle('all-work:hidden-columns-menu', (event, request: unknown) => {
			if (!isTrustedSender(event, appUrl)) {
				throw new Error('Column menus are only available inside All Work.')
			}

			if (!isHiddenColumnsMenuRequest(request)) {
				throw new TypeError('Invalid hidden columns menu request.')
			}

			const window = BrowserWindow.fromWebContents(event.sender)
			if (window === null) {
				return
			}

			// Section headers need macOS 14; elsewhere a disabled item labels each category
			const items = request.groups.flatMap(({ category, columns }, index) => [
				...(index > 0 ? [{ type: 'separator' } as const] : []),
				process.platform === 'darwin'
					? ({ label: category, type: 'header' } as const)
					: { enabled: false, label: category },
				...columns.map(({ id, label }): MenuItemConstructorOptions => ({
					click() {
						event.sender.send('all-work:menu-command', 'column.show' satisfies MenuCommand, id)
					},
					label,
				})),
			])
			Menu.buildFromTemplate(
				items.length > 0 ? items : [{ enabled: false, label: 'All Columns Shown' }],
			).popup({ window })
		})

		ipcMain.handle('all-work:repository-menu', async (event, request: unknown) => {
			if (!isTrustedSender(event, appUrl)) {
				throw new Error('Repository menus are only available inside All Work.')
			}

			if (!isRepositoryMenuRequest(request)) {
				throw new TypeError('Invalid repository menu request.')
			}

			const window = BrowserWindow.fromWebContents(event.sender)
			if (window === null) {
				return
			}

			return new Promise<RepositoryMenuChoice | undefined>((resolve) => {
				const items: Array<'separator' | [string, RepositoryMenuChoice, boolean]> = [
					['Open Readme', 'readme', request.hasReadme],
					['Open in Tower', 'tower', true],
					['Open in VS Code', 'vscode', true],
					['Open in GitHub', 'github', request.hasGithubRemote],
					['Open Website', 'website', request.hasWebsite],
					['Reveal in Finder', 'finder', true],
					['Copy Path', 'copyPath', true],
					['Open in Terminal', 'terminal', true],
					'separator',
					['Refresh Metadata', 'refresh', true],
				]
				Menu.buildFromTemplate(
					items.map((item) => {
						if (item === 'separator') {
							return { type: 'separator' } as const
						}

						const [label, choice, enabled] = item
						return {
							click() {
								resolve(choice)
							},
							enabled,
							label,
						}
					}),
				).popup({
					callback() {
						resolve(undefined)
					},
					window,
				})
			})
		})

		ipcMain.on('all-work:menu-state', (event, state: unknown) => {
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
