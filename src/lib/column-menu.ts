import type { PinnedColumns } from './column-order.js'
import type { MenuActions } from './electron-api.js'
import type { CommandRun, Repository } from './workspace.js'
import { focusLastFilterRule } from './filter-focus.js'
import { getColumnCopyLines } from './table-formatting.js'

type MenuColumn = {
	getCanFilter: () => boolean
	getCanHide: () => boolean
	getCanSort: () => boolean
	id: string
	toggleSorting: (descending: boolean, multiple: boolean) => void
}

type ColumnMenuOptions = {
	beforeSort: () => void
	getColumn: (id: string) => MenuColumn | undefined
	/** Rows shown by the table, or only the selected ones, in table order. */
	getRows: (selected: boolean) => readonly Repository[]
	getRuns: () => readonly CommandRun[]
	onError: (error: unknown) => void
	onFilter: (id: string) => void
	onHide: (id: string) => Promise<void>
	onSort: () => void
	pinned: () => PinnedColumns
}

/**
 * Connect a column's native menu to sorting, visibility, filter rules, and
 * copying its plain text.
 */
export function createColumnMenu(options: ColumnMenuOptions) {
	function getColumn(id: string | undefined) {
		return id === undefined ? undefined : options.getColumn(id)
	}

	function canHide(column: MenuColumn) {
		const pinned = options.pinned()
		return (
			column.getCanHide() && !pinned.start.includes(column.id) && !pinned.end.includes(column.id)
		)
	}

	async function filter(id: string) {
		options.onFilter(id)
		await focusLastFilterRule()
	}

	function sort(id: string | undefined, descending: boolean) {
		const column = getColumn(id)
		if (!column?.getCanSort()) {
			return
		}

		options.beforeSort()
		column.toggleSorting(descending, false)
		options.onSort()
	}

	async function copy(id: string | undefined, selected: boolean) {
		const column = getColumn(id)
		const rows = options.getRows(selected)
		if (column === undefined || (selected && rows.length === 0)) {
			return
		}

		try {
			// eslint-disable-next-line node/no-unsupported-features/node-builtins -- The clipboard is written in the browser.
			await navigator.clipboard.writeText(getColumnCopyLines(rows, column.id, options.getRuns()))
		} catch (error) {
			options.onError(error)
		}
	}

	async function hide(id: string) {
		try {
			await options.onHide(id)
		} catch (error) {
			options.onError(error)
		}
	}

	const actions: Pick<MenuActions, Extract<keyof MenuActions, `column.${string}`>> = {
		'column.copy'(payload) {
			void copy(payload, false)
		},
		'column.copySelected'(payload) {
			void copy(payload, true)
		},
		'column.filter'(payload) {
			const column = getColumn(payload)
			if (column?.getCanFilter()) {
				void filter(column.id)
			}
		},
		'column.hide'(payload) {
			const column = getColumn(payload)
			if (column !== undefined && canHide(column)) {
				void hide(column.id)
			}
		},
		'column.sortAscending'(payload) {
			sort(payload, false)
		},
		'column.sortDescending'(payload) {
			sort(payload, true)
		},
	}

	return {
		actions,
		async show(event: MouseEvent, columnId: string) {
			const column = getColumn(columnId)
			if (column === undefined || globalThis._allwork === undefined) {
				return
			}

			event.preventDefault()
			try {
				await globalThis._allwork.showColumnMenu({
					canFilter: column.getCanFilter(),
					canHide: canHide(column),
					canSort: column.getCanSort(),
					columnId,
					hasSelection: options.getRows(true).length > 0,
				})
			} catch (error) {
				options.onError(error)
			}
		},
	}
}
