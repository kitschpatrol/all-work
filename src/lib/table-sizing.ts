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

/** Measure text without cloning the entire table or forcing a layout per cell. */
export function measureColumns(
	container: HTMLElement,
	columns: SizingColumn[],
): Record<string, number> {
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
