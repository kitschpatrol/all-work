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
 * Open a native Electron window for the target. Reopening a window that is
 * already open brings it to the front instead.
 */
export async function openElectronWindow(target: AppWindow): Promise<void> {
	if (globalThis._allwork === undefined) {
		throw new Error('Native windows are only available in the AllWork app.')
	}

	await globalThis._allwork.openWindow(describeWindow(target))
}
