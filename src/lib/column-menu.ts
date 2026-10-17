import type { PinnedColumns } from './column-order.js'
import type { MenuActions } from './electron-api.js'
import { focusLastFilterRule } from './filter-focus.js'

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
	onError: (error: unknown) => void
	onFilter: (id: string) => void
	onHide: (id: string) => Promise<void>
	onSort: () => void
	pinned: () => PinnedColumns
}

/**
 * Connect a column's native menu to sorting, visibility, and filter rules.
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

	async function hide(id: string) {
		try {
			await options.onHide(id)
		} catch (error) {
			options.onError(error)
		}
	}

	const actions: Pick<MenuActions, Extract<keyof MenuActions, `column.${string}`>> = {
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
				})
			} catch (error) {
				options.onError(error)
			}
		},
	}
}
