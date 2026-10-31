import { tick } from 'svelte'
import type { CommandRun, Repository } from './workspace.js'
import { getColumnDisplay } from './column-variables.js'
import { getColumnSizingValue } from './table-formatting.js'

type SizingColumn = {
	header: string
	id: string
	maxSize: number
	/**
	 * Where a cell of the same kind shows its value, for a column whose own cells
	 * aren't rendered.
	 */
	sample: string
	values: string[]
}

// Where a column's values show within a row, by the classes CellContent gives them
function contentSample(id: string, repository: boolean): string {
	if (!repository) {
		return '.output-preview pre'
	}

	switch (id) {
		case 'branch': {
			return '.branch'
		}

		case 'changedFiles':
		case 'sync': {
			return 'td'
		}

		case 'lastCommitDate': {
			return '.date-value'
		}

		case 'name': {
			return '.project-name'
		}

		case 'relativePath': {
			return '.repository-name strong'
		}

		default: {
			return getColumnDisplay(id) === 'text' ? '.cell-text:not(.monospace)' : '.cell-text.monospace'
		}
	}
}

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

// The element a column's values show in, whose font they're measured in
function valueElement(
	row: HTMLElement | undefined,
	cell: HTMLElement | undefined,
	sample: string,
): HTMLElement | undefined {
	// A column outside the viewport has no cells rendered, so it reads a cell showing the same kind of value
	return cell === undefined
		? (row?.querySelector<HTMLElement>(sample) ??
				row?.querySelector<HTMLElement>('td') ??
				undefined)
		: (cell.querySelector<HTMLElement>(
				'.cell-text, .project-name, .branch, .date-value, strong, pre',
			) ?? cell)
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

	const row =
		table.querySelector<HTMLElement>(':scope > tbody > tr[data-repository-id]') ?? undefined
	// Every header shares one font, so a column outside the viewport reads another's
	const anyHeader = table.querySelector<HTMLElement>(':scope > thead th[data-column-id]')
	const sizes: Record<string, number> = {}
	for (const column of columns) {
		const selector = `[data-column-id="${CSS.escape(column.id)}"]`
		const header = table.querySelector<HTMLElement>(`:scope > thead th${selector}`) ?? anyHeader
		const cell = row?.querySelector<HTMLElement>(`td${selector}`) ?? undefined
		context.font = header === null ? '11px sans-serif' : canvasFont(header)
		let width = context.measureText(column.header).width + 30
		const content = valueElement(row, cell, column.sample)
		context.font = content === undefined ? '10px sans-serif' : canvasFont(content)
		const extra =
			column.id === 'relativePath'
				? ((cell ?? row)?.querySelector('.repository-actions')?.getBoundingClientRect().width ??
						110) + 42
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
				sample: contentSample(column.id, options.isRepositoryColumn(column.id)),
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
