import { SvelteSet } from 'svelte/reactivity'
import type { CommandRun } from './workspace.js'

/**
 * Track which run columns sort by their commands' exit codes rather than their
 * output.
 */
export function createRunSorting() {
	const exitCodeRunIds = new SvelteSet<string>()

	/** Sort a run's column by exit code, or by output. */
	function set(runId: string, byExitCode: boolean) {
		if (byExitCode) {
			exitCodeRunIds.add(runId)
		} else {
			exitCodeRunIds.delete(runId)
		}
	}

	/** Replace which run columns sort by exit code. */
	function restore(runIds: readonly string[]) {
		exitCodeRunIds.clear()
		for (const runId of runIds) {
			exitCodeRunIds.add(runId)
		}
	}

	/** Whether a run's column sorts by exit code. */
	function sortsByExitCode(runId: string) {
		return exitCodeRunIds.has(runId)
	}

	/**
	 * The value a run's column sorts by for a repository: its exit code, which is
	 * undefined until the command exits, or its output.
	 */
	function value(run: CommandRun, repositoryId: string): number | string | undefined {
		const result = run.results[repositoryId]
		return exitCodeRunIds.has(run.id) ? result?.exitCode : (result?.output ?? '')
	}

	return {
		restore,
		/** Run columns that sort by exit code, to save with the view. */
		get runIds() {
			return [...exitCodeRunIds]
		},
		set,
		sortsByExitCode,
		value,
	}
}
