import type { DockedColumns, DockSide } from './column-order.js'
import type { MenuActions } from './electron-api.js'
import type { CommandRun, Repository } from './workspace.js'
import { getDockSide } from './column-order.js'
import { getColumnVariableName } from './column-variables.js'
import { focusLastFilterRule } from './filter-focus.js'
import { getColumnCopyLines } from './table-formatting.js'

type MenuColumn = {
	getCanFilter: () => boolean
	getCanHide: () => boolean
	getCanSort: () => boolean
	id: string
	toggleSorting: (descending: boolean, multiple: boolean) => void
}

type OptionalColumn = {
	category: string
	header: string
	id: string
	onDemand: boolean
	visible: boolean
}

type ColumnMenuOptions = {
	beforeSort: () => void
	/** Columns docked at either edge, fixed ones included. */
	docked: () => DockedColumns
	/** Columns that never dock, undock, or move. */
	fixed: readonly string[]
	getColumn: (id: string) => MenuColumn | undefined
	/** Visible column ids in display order. */
	getColumnOrder: () => readonly string[]
	/** Columns that can be shown and hidden, in column order. */
	getOptionalColumns: () => readonly OptionalColumn[]
	/** Rows shown by the table, or only the selected ones, in table order. */
	getRows: (selected: boolean) => readonly Repository[]
	getRuns: () => readonly CommandRun[]
	onDock: (id: string, side: DockSide) => void
	onError: (error: unknown) => void
	onFilter: (id: string) => void
	onHide: (id: string) => Promise<void>
	onRemoveRuns: (ids: readonly string[]) => void
	/** Show a hidden column at the end of the table, where its menu opened. */
	onShow: (id: string) => Promise<void>
	onSort: () => void
	/** Sort a run column by its commands' exit codes, or by their output. */
	sortByExitCode: (runId: string, byExitCode: boolean) => void
}

/**
 * Connect a column's native menu to sorting, visibility, docking, filter rules,
 * copying its plain text or shell variable, and, for a run column, copying its
 * command, sorting by exit code, and clearing finished runs beside it, and the
 * empty header space's menu to showing hidden columns.
 */
export function createColumnMenu(options: ColumnMenuOptions) {
	function getColumn(id: string | undefined) {
		return id === undefined ? undefined : options.getColumn(id)
	}

	function canDock(id: string) {
		return !options.fixed.includes(id)
	}

	function getFinishedRunsBeside(id: string | undefined, side: 'left' | 'right') {
		const order = options.getColumnOrder()
		const index = id === undefined ? -1 : order.indexOf(id)
		if (index === -1) {
			return []
		}

		const finished = new Set(
			options
				.getRuns()
				.filter((run) => run.finished)
				.map((run) => run.id),
		)
		const beside = side === 'left' ? order.slice(0, index) : order.slice(index + 1)
		return beside.filter((columnId) => finished.has(columnId))
	}

	function clearFinishedBeside(id: string | undefined, side: 'left' | 'right') {
		const ids = getFinishedRunsBeside(id, side)
		if (ids.length > 0) {
			options.onRemoveRuns(ids)
		}
	}

	async function filter(id: string) {
		options.onFilter(id)
		await focusLastFilterRule()
	}

	function isRun(id: string) {
		return options.getRuns().some((run) => run.id === id)
	}

	function sort(id: string | undefined, descending: boolean, byExitCode = false) {
		const column = getColumn(id)
		if (!column?.getCanSort() || (byExitCode && !isRun(column.id))) {
			return
		}

		if (isRun(column.id)) {
			options.sortByExitCode(column.id, byExitCode)
		}

		options.beforeSort()
		column.toggleSorting(descending, false)
		options.onSort()
	}

	async function writeClipboard(text: string) {
		try {
			// eslint-disable-next-line node/no-unsupported-features/node-builtins -- The clipboard is written in the browser.
			await navigator.clipboard.writeText(text)
		} catch (error) {
			options.onError(error)
		}
	}

	async function copy(id: string | undefined, selected: boolean) {
		const column = getColumn(id)
		const rows = options.getRows(selected)
		if (column === undefined || (selected && rows.length === 0)) {
			return
		}

		await writeClipboard(getColumnCopyLines(rows, column.id, options.getRuns()))
	}

	async function copyVariable(id: string | undefined) {
		const name = id === undefined ? undefined : getColumnVariableName(id, options.getRuns())
		if (name === undefined) {
			return
		}

		await writeClipboard(`$${name}`)
	}

	async function copyCommand(id: string | undefined) {
		const run = options.getRuns().find((entry) => entry.id === id)
		if (run !== undefined) {
			await writeClipboard(run.command)
		}
	}

	async function changeVisibility(change: (id: string) => Promise<void>, id: string) {
		try {
			await change(id)
		} catch (error) {
			options.onError(error)
		}
	}

	const actions: Pick<MenuActions, Extract<keyof MenuActions, `column.${string}`>> = {
		'column.clearFinishedLeft'(payload) {
			clearFinishedBeside(payload, 'left')
		},
		'column.clearFinishedRight'(payload) {
			clearFinishedBeside(payload, 'right')
		},
		'column.copy'(payload) {
			void copy(payload, false)
		},
		'column.copyCommand'(payload) {
			void copyCommand(payload)
		},
		'column.copySelected'(payload) {
			void copy(payload, true)
		},
		'column.copyVariable'(payload) {
			void copyVariable(payload)
		},
		'column.dockEnd'(payload) {
			if (payload !== undefined && canDock(payload)) {
				options.onDock(payload, 'end')
			}
		},
		'column.dockStart'(payload) {
			if (payload !== undefined && canDock(payload)) {
				options.onDock(payload, 'start')
			}
		},
		'column.filter'(payload) {
			const column = getColumn(payload)
			if (column?.getCanFilter()) {
				void filter(column.id)
			}
		},
		'column.hide'(payload) {
			const column = getColumn(payload)
			if (column?.getCanHide()) {
				void changeVisibility(options.onHide, column.id)
			}
		},
		'column.show'(payload) {
			const column = getColumn(payload)
			if (column?.getCanHide()) {
				void changeVisibility(options.onShow, column.id)
			}
		},
		'column.sortAscending'(payload) {
			sort(payload, false)
		},
		'column.sortDescending'(payload) {
			sort(payload, true)
		},
		'column.sortExitCodeAscending'(payload) {
			sort(payload, false, true)
		},
		'column.sortExitCodeDescending'(payload) {
			sort(payload, true, true)
		},
	}

	return {
		actions,
		async show(event: MouseEvent, columnId: string) {
			const column = getColumn(columnId)
			if (column === undefined || globalThis._allWork === undefined) {
				return
			}

			event.preventDefault()
			try {
				await globalThis._allWork.showColumnMenu({
					canDock: canDock(columnId),
					canFilter: column.getCanFilter(),
					canHide: column.getCanHide(),
					canSort: column.getCanSort(),
					columnId,
					dock: getDockSide(options.docked(), columnId),
					hasFinishedRunsLeft: getFinishedRunsBeside(columnId, 'left').length > 0,
					hasFinishedRunsRight: getFinishedRunsBeside(columnId, 'right').length > 0,
					hasSelection: options.getRows(true).length > 0,
					hasVariable: getColumnVariableName(columnId, options.getRuns()) !== undefined,
					isRun: isRun(columnId),
				})
			} catch (error) {
				options.onError(error)
			}
		},
		async showHidden(event: MouseEvent) {
			if (globalThis._allWork === undefined) {
				return
			}

			event.preventDefault()
			const hidden = options.getOptionalColumns().filter((column) => !column.visible)
			const groups = Map.groupBy(hidden, (column) => column.category)
			try {
				await globalThis._allWork.showHiddenColumnsMenu({
					groups: Array.from(groups, ([category, columns]) => ({
						category,
						columns: columns.map(({ header, id, onDemand }) => ({
							id,
							label: onDemand ? `${header} · on demand` : header,
						})),
					})),
				})
			} catch (error) {
				options.onError(error)
			}
		},
	}
}
