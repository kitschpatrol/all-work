import { untrack } from 'svelte'
import type { Repository } from './workspace.js'

type TableRowsOptions = {
	/** The rule filter. A new function whenever the rules change. */
	matches: () => (repository: Repository) => boolean
	/** Whether filtering, searching, or sorting reads row values now. */
	readsValues: () => boolean
	/** Every repository, which metadata and run output change in place. */
	repositories: () => readonly Repository[]
	/** Only these repositories show while set. */
	selection: () => Readonly<Record<string, boolean>> | undefined
}

/** How often values changing in place may re-filter and re-sort the table. */
const interval = 1000

/**
 * Derive the rows the table filters and sorts. Replacing the repositories,
 * selection, or rules updates the rows right away. Values that change in place,
 * as metadata and run output stream in, are read again at most once a second,
 * so rows don't jump with every update and each cell still updates on its own.
 *
 * @param options Sources for the repositories and what decides which show.
 *
 * @returns The rows, and actions that read row values again.
 */
export function createTableRows(options: TableRowsOptions) {
	let version = $state(0)
	let last = -Infinity
	let timer: ReturnType<typeof setTimeout> | undefined
	const rows = $derived.by(() => {
		version
		const repositories = options.repositories()
		const selection = options.selection()
		const matches = options.matches()
		return untrack(() =>
			repositories.filter(
				(repository) =>
					(selection === undefined || selection[repository.id] === true) && matches(repository),
			),
		)
	})

	function cancel() {
		clearTimeout(timer)
		timer = undefined
	}

	function refresh() {
		cancel()
		last = Date.now()
		version++
	}

	return {
		/** Read row values again soon, after they changed in place. */
		changed() {
			if (timer !== undefined || !options.readsValues()) {
				return
			}

			const wait = last + interval - Date.now()
			if (wait <= 0) {
				refresh()
			} else {
				timer = setTimeout(refresh, wait)
			}
		},
		dispose: cancel,
		/** Read row values again now, before an action that depends on them. */
		refresh,
		get rows() {
			return rows
		},
	}
}
