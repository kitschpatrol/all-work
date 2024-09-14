import { app, BrowserWindow, dialog, shell, utilityProcess } from 'electron'
import { execa } from 'execa'
import net from 'node:net'
import path from 'node:path'

// Vite default dev & production ports
const sveltePort = app.isPackaged ? '4173' : '5173'
const SVELTE_HOST = '127.0.0.1'

function createWindow() {
	const mainWindow = new BrowserWindow({
		height: 1024,
		minHeight: 640,
		minWidth: 400,
		title: 'AllWork',
		webPreferences: {
			webSecurity: false, // Disable web security to allow loading local resources
		},
		width: 768,
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
			url.startsWith('file://') ||
			url.startsWith('gittower://') ||
			url.startsWith('vscode://') ||
			url !== mainWindow.webContents.getURL()
		) {
			event.preventDefault()

			if (url.startsWith('vscode://')) {
				const path = url.replace('vscode://', '')

				execa('code', [path]).catch((error) => {
					dialog.showErrorBox('Error', error.message)
				})
			} else {
				// All other protocols handled
				shell.openExternal(url)
			}
		}
	})
}

function checkServerAvailability(port) {
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

app
	.whenReady()
	.then(async () => {
		if (app.isPackaged) {
			utilityProcess.fork(path.join(app.getAppPath(), 'build', 'index.js'), {
				env: { ...process.env, PORT: sveltePort },
			})
		} else {
			console.warn('##### Running Electron in development mode')
			console.log('##### Run `npm run dev` to start the SvelteKit server separately')
		}

		await checkServerAvailability(Number.parseInt(sveltePort, 10))
		createWindow()
	})
	// eslint-disable-next-line unicorn/prefer-top-level-await
	.catch((error) => {
		dialog.showErrorBox('Error', error.message)
		app.quit()
	})

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit()
})

// MacOS: Open a window if none are open
app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
