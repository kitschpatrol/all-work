import type { AppWindowRequest } from './electron-api.js'

/** Secondary windows the main page can open. */
export type AppWindow =
	| { kind: 'output'; name: string; path: string; repositoryId: string; runId: string }
	| { kind: 'preferences' }

function describeWindow(target: AppWindow): AppWindowRequest {
	if (target.kind === 'preferences') {
		return {
			height: 600,
			name: 'allwork-preferences',
			resizable: false,
			url: '/preferences',
			width: 520,
		}
	}

	const params = new URLSearchParams({
		name: target.name,
		path: target.path,
		repository: target.repositoryId,
		run: target.runId,
	})
	return {
		height: 640,
		name: `allwork-output-${target.runId}-${target.repositoryId}`,
		resizable: true,
		url: `/output?${params.toString()}`,
		width: 900,
	}
}

/**
 * Open a secondary window: a native window in Electron, a popup in a browser.
 * Reopening a window that is already open brings it to the front instead.
 */
export async function openAppWindow(target: AppWindow): Promise<void> {
	const request = describeWindow(target)
	if (globalThis._allwork !== undefined) {
		await globalThis._allwork.openWindow(request)
		return
	}

	const opened = open(
		request.url,
		request.name,
		`popup,width=${request.width},height=${request.height}`,
	)
	if (opened === null) {
		throw new Error('The browser blocked the window. Allow pop-ups for AllWork to open it.')
	}

	opened.focus()
}
