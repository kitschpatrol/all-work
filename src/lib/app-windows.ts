import type { AppWindowRequest } from './electron-api.js'
import type { CommandRun, Repository } from './workspace.js'

/** One repository's result in a run, as an output window shows it. */
export type OutputTarget = {
	name: string
	path: string
	/** The Repository column value, which titles the output window. */
	relativePath: string
	repositoryId: string
	runId: string
}

/** The results before and after an output window's own, in table order. */
export type OutputNeighbors = { next: OutputTarget | undefined; previous: OutputTarget | undefined }

/** Secondary windows the main page can open. */
export type AppWindow = (OutputTarget & { kind: 'output' }) | { kind: 'preferences' }

/** The output window's address for a result. */
export function outputWindowUrl(target: OutputTarget): string {
	const params = new URLSearchParams({
		name: target.name,
		path: target.path,
		relativePath: target.relativePath,
		repository: target.repositoryId,
		run: target.runId,
	})
	return `/output?${params.toString()}`
}

/**
 * Find the results beside a repository's result, skipping rows the run did not
 * include. A repository missing from the rows has no neighbors.
 *
 * @param rows The table's rows in display order.
 * @param run The run whose results are being stepped through.
 * @param repositoryId The repository whose result is shown.
 */
export function getOutputNeighbors(
	rows: readonly Repository[],
	run: CommandRun | undefined,
	repositoryId: string,
): OutputNeighbors {
	const withResults =
		run === undefined ? [] : rows.filter((row) => Object.hasOwn(run.results, row.id))
	const index = withResults.findIndex((row) => row.id === repositoryId)
	const target = (row: Repository | undefined) =>
		row === undefined || run === undefined
			? undefined
			: {
					name: row.name,
					path: row.path,
					relativePath: row.relativePath,
					repositoryId: row.id,
					runId: run.id,
				}
	return index === -1
		? { next: undefined, previous: undefined }
		: { next: target(withResults[index + 1]), previous: target(withResults[index - 1]) }
}

function describeWindow(target: AppWindow): AppWindowRequest {
	return target.kind === 'preferences'
		? { height: 720, resizable: false, url: '/preferences', width: 520 }
		: { height: 640, resizable: true, url: outputWindowUrl(target), width: 900 }
}

/**
 * Open a native Electron window for the target. Reopening a window that is
 * already open brings it to the front instead.
 */
export async function openElectronWindow(target: AppWindow): Promise<void> {
	if (globalThis._allWork === undefined) {
		throw new Error('Native windows are only available in the All Work app.')
	}

	await globalThis._allWork.openWindow(describeWindow(target))
}
