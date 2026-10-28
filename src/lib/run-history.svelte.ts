import type { CommandRun } from './workspace.js'
import { request } from './client-request.js'

function numberAfter(runs: readonly CommandRun[], floor: number) {
	return Math.max(floor, ...runs.map((run) => run.number + 1))
}

async function deleteRun(runId: string) {
	await request(`/api/runs/${runId}`, {}, 'DELETE')
}

/**
 * Number new runs and keep cleared runs that filter rules still read. Numbers
 * count up from 1 and are not reused until the view resets, so "Run 3" in a
 * header, a filter rule, or `$ALL_WORK_COLUMN_RUN_3` always means the same
 * run.
 *
 * @param isFiltered Whether a filter rule reads a run's output.
 *
 * @returns Reactive cleared runs and next number, and the actions that change
 *   them.
 */
export function createRunHistory(isFiltered: (runId: string) => boolean) {
	let cleared = $state.raw<CommandRun[]>([])
	let nextNumber = $state(1)

	// Take a run's column away: stop it and keep its output while rules filter by it, otherwise delete it
	async function clear(runId: string, runs: readonly CommandRun[]) {
		const run = runs.find((entry) => entry.id === runId)
		if (run === undefined || !isFiltered(runId)) {
			await deleteRun(runId)
			return
		}

		await request(`/api/runs/${runId}`, {}, 'PATCH')
		cleared = [...cleared, run]
	}

	// Count a started run so later runs get higher numbers
	function counted(run: CommandRun) {
		nextNumber = numberAfter([run], nextNumber)
	}

	// Delete cleared runs that no rule reads any more
	async function release() {
		const released = cleared.filter((run) => !isFiltered(run.id))
		if (released.length === 0) {
			return
		}

		cleared = cleared.filter((run) => isFiltered(run.id))
		await Promise.all(released.map(async (run) => deleteRun(run.id)))
	}

	// Delete every cleared run and number after the runs still showing, or from 1
	async function reset(runs: readonly CommandRun[]) {
		const released = cleared
		cleared = []
		nextNumber = numberAfter(runs, 1)
		await Promise.all(released.map(async (run) => deleteRun(run.id)))
	}

	// Split restored runs into columns and cleared runs, returning the columns
	function restore(restored: CommandRun[], clearedIds: readonly string[], savedNumber: number) {
		cleared = restored.filter((run) => clearedIds.includes(run.id))
		nextNumber = numberAfter(restored, savedNumber)
		return restored.filter((run) => !clearedIds.includes(run.id))
	}

	return {
		clear,
		// Runs whose columns were cleared while filter rules still read them
		get cleared() {
			return cleared
		},
		counted,
		// The number the next run will get
		get nextNumber() {
			return nextNumber
		},
		release,
		reset,
		restore,
	}
}
