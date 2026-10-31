import { tick } from 'svelte'
import type { CommandRun, Repository } from './workspace.js'
import { getColumnSizingValue } from './table-formatting.js'

type SizingColumn = { header: string; id: string; maxSize: number; values: string[] }

/**
 * Describe an element's font for the canvas from its individual font
 * properties. The computed `font` shorthand is empty whenever a property it
 * can't express, such as `font-variant-numeric`, is set, and the canvas ignores
 * an empty font.
 */
function canvasFont(element: HTMLElement): string {
	const { fontFamily, fontSize, fontStyle, fontWeight } = getComputedStyle(element)
	return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`
}

// Measure text without cloning the entire table or forcing a layout per cell
function measureColumns(container: HTMLElement, columns: SizingColumn[]): Record<string, number> {
	const canvas = document.createElement('canvas')
	const context = canvas.getContext('2d')
	if (context === null) {
		return {}
	}

	const table = container.querySelector('table')
	if (table === null) {
		return {}
	}

	const headers = [...table.querySelectorAll<HTMLElement>(':scope > thead > tr > th')]
	const cells = [
		...(table
			.querySelector(':scope > tbody > tr[data-repository-id]')
			?.querySelectorAll<HTMLElement>('td') ?? []),
	]
	const sizes: Record<string, number> = {}
	for (const column of columns) {
		const header = headers.find((entry) => entry.dataset.columnId === column.id)
		const index = header === undefined ? -1 : headers.indexOf(header)
		const cell = cells[index]
		context.font = header === undefined ? '11px sans-serif' : canvasFont(header)
		let width = context.measureText(column.header).width + 30
		const content =
			cell?.querySelector<HTMLElement>(
				'.cell-text, .project-name, .branch, .date-value, strong, pre',
			) ?? cell
		context.font = content === undefined ? '10px sans-serif' : canvasFont(content)
		const extra =
			column.id === 'relativePath'
				? (cell?.querySelector('.repository-actions')?.getBoundingClientRect().width ?? 110) + 42
				: 18
		for (const value of column.values) {
			for (const line of value.split('\n').slice(0, 3)) {
				width = Math.max(width, context.measureText(line).width + extra)
			}
		}

		sizes[column.id] = Math.min(column.maxSize, Math.ceil(width))
	}

	return sizes
}

type FittingColumn = {
	columnDef: { header?: unknown; maxSize?: number; minSize?: number }
	getCanResize: () => boolean
	getSize: () => number
	id: string
}

type FittingTable = {
	getRowModel: () => { rows: ReadonlyArray<{ original: Repository }> }
	getVisibleLeafColumns: () => FittingColumn[]
	setColumnSizing(update: (previous: Record<string, number>) => Record<string, number>): void
}

type ColumnFittingOptions = {
	isRepositoryColumn: (id: string) => boolean
	runs: () => readonly CommandRun[]
	/** The table's scroller, rendered once the page mounts. */
	scroller: () => HTMLElement
	table: FittingTable
}

/**
 * Size columns to fit their header and values. Automatic fitting caps widths to
 * a share of the scroller, and a table scrolled to its end stays there as
 * columns grow.
 *
 * @param options The table, its scroller and runs, and which columns show
 *   repository values.
 *
 * @returns Fitting for any columns, and for a run's column as it starts or
 *   finishes.
 */
export function createColumnFitting(options: ColumnFittingOptions) {
	const { table } = options

	// Fit the given columns, or every visible one
	function fit(columnIds?: string[], { automatic = true, growOnly = false } = {}) {
		const scroller = options.scroller()
		const runs = options.runs()
		const followEnd =
			runs.length > 0 &&
			scroller.scrollLeft > 0 &&
			scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2
		const maxWidth = automatic ? Math.min(180, Math.floor(scroller.clientWidth * 0.12)) : Infinity
		const maxRunWidth = automatic ? Math.floor(scroller.clientWidth * 0.2) : Infinity
		const selected = table
			.getVisibleLeafColumns()
			.filter(
				(column) =>
					column.getCanResize() && (columnIds === undefined || columnIds.includes(column.id)),
			)
		const { rows } = table.getRowModel()
		const sizes = measureColumns(
			scroller,
			selected.map((column) => ({
				header: String(column.columnDef.header),
				id: column.id,
				maxSize: Math.min(
					column.columnDef.maxSize ?? 4000,
					column.id === 'relativePath'
						? maxWidth * 2
						: options.isRepositoryColumn(column.id)
							? maxWidth
							: maxRunWidth,
				),
				values: rows.map((row) => getColumnSizingValue(row.original, column.id, runs)),
			})),
		)
		for (const column of selected) {
			sizes[column.id] = Math.max(
				column.columnDef.minSize ?? 24,
				sizes[column.id] ?? column.getSize(),
				growOnly ? column.getSize() : 0,
			)
		}

		if (selected.every((column) => sizes[column.id] === column.getSize())) {
			return
		}

		table.setColumnSizing((previous) => ({ ...previous, ...sizes }))
		if (followEnd) {
			void tick().then(() => {
				scroller.scrollLeft = scroller.scrollWidth
			})
		}
	}

	// Fit a run's column once it renders, revealing it or keeping a table scrolled to its end there
	async function fitRun(runId: string, reveal = false) {
		const scroller = options.scroller()
		const followEnd =
			reveal || scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2
		await tick()
		fit([runId])
		await tick()
		if (followEnd) {
			scroller.scrollLeft = scroller.scrollWidth
		}
	}

	return { fit, fitRun }
}
