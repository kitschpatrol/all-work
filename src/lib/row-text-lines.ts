import type { Attachment } from 'svelte/attachments'

/** The line height app.css sets on wrapped `.cell-text`. */
const LINE_HEIGHT = 14
/** Text cells' vertical padding, which output cells don't have. */
const CELL_PADDING = 4

const heights = new WeakMap<Element, number>()
const rowsByElement = new WeakMap<Element, HTMLTableRowElement>()
const elementsByRow = new WeakMap<HTMLTableRowElement, Set<Element>>()
let observer: ResizeObserver | undefined

/** Count the lines of wrapped cell text that fit in a row this tall. */
export function textLinesBeside(height: number): number {
	return Math.max(1, Math.floor((height - CELL_PADDING) / LINE_HEIGHT))
}

function update(row: HTMLTableRowElement) {
	const elements = elementsByRow.get(row) ?? []
	let height = 0
	for (const element of elements) {
		height = Math.max(height, heights.get(element) ?? 0)
	}

	const lines = textLinesBeside(height)
	if (lines === 1) {
		delete row.dataset.textLines
		row.style.removeProperty('--text-lines')
	} else if (row.dataset.textLines !== String(lines)) {
		row.dataset.textLines = String(lines)
		row.style.setProperty('--text-lines', String(lines))
	}
}

function resize(entries: ResizeObserverEntry[]) {
	const rows = new Set<HTMLTableRowElement>()
	for (const entry of entries) {
		const [size] = entry.borderBoxSize
		const row = rowsByElement.get(entry.target)
		if (size === undefined || row === undefined) {
			continue
		}

		heights.set(entry.target, size.blockSize)
		rows.add(row)
	}

	for (const row of rows) {
		update(row)
	}
}

/**
 * Let the text cells in this element's row wrap onto the lines its height
 * leaves room for, rather than truncating to one line. Attach it to content
 * whose height doesn't stretch with the row, such as command output, so the
 * wrapped text never holds the row open. Every element shares one observer.
 */
export const wrapRowText: Attachment<HTMLElement> = (element) => {
	const row = element.closest('tr')
	if (row === null) {
		return
	}

	let elements = elementsByRow.get(row)
	if (elements === undefined) {
		elements = new Set()
		elementsByRow.set(row, elements)
	}

	elements.add(element)
	rowsByElement.set(element, row)
	observer ??= new ResizeObserver(resize)
	observer.observe(element)
	return () => {
		observer?.unobserve(element)
		elements.delete(element)
		heights.delete(element)
		update(row)
	}
}
