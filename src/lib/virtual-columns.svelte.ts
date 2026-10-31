import type { Attachment } from 'svelte/attachments'
import { on } from 'svelte/events'
import type { DockedColumns } from './column-order.js'
import { visibleRange } from './virtual-rows.svelte.js'

/**
 * One place in a table row: a column's cell, a spacer standing in for a stretch
 * of scrolling columns far outside the viewport, or the blank space before the
 * right dock.
 */
export type ColumnSlot =
	| { id: string; kind: 'column' }
	| { id: string; kind: 'filler' }
	| { id: string; kind: 'spacer'; span: number }

type VirtualColumnsOptions = {
	/**
	 * Visible columns in display order: the left dock, the scrolling columns,
	 * then the right dock.
	 */
	columns: () => ReadonlyArray<{ getSize: () => number; id: string }>
	docked: () => DockedColumns
	/**
	 * Whether a scrolling column renders wherever it is, such as one whose cells
	 * set row heights.
	 */
	keep: (id: string) => boolean
	/** Width rendered beyond each edge of the viewport, in pixels. */
	overscan?: number
}

/**
 * Lay out a table row: the docked columns, the scrolling columns in `range`
 * along with any kept wherever they are, one spacer for each stretch of the
 * rest, and the blank space before the right dock.
 *
 * @param ids Visible column ids in display order: the left dock, the scrolling
 *   columns, then the right dock.
 * @param docked Columns docked at either edge.
 * @param range The scrolling columns to render, by index among them.
 * @param range.start The first one.
 * @param range.end The index after the last one.
 * @param keep Whether a scrolling column renders wherever it is.
 *
 * @returns The row's slots in display order.
 */
export function columnSlots(
	ids: readonly string[],
	docked: DockedColumns,
	range: { start: number; end: number },
	keep: (id: string) => boolean,
): ColumnSlot[] {
	const start = ids.filter((id) => docked.start.includes(id))
	const end = ids.filter((id) => docked.end.includes(id))
	const scrolling = ids.filter((id) => !docked.start.includes(id) && !docked.end.includes(id))
	const slots: ColumnSlot[] = start.map((id) => ({ id, kind: 'column' }))
	let skipped: string[] = []
	for (const [index, id] of scrolling.entries()) {
		if ((index < range.start || index >= range.end) && !keep(id)) {
			skipped.push(id)
			continue
		}

		if (skipped.length > 0) {
			slots.push({ id: `spacer:${skipped[0]}`, kind: 'spacer', span: skipped.length })
			skipped = []
		}

		slots.push({ id, kind: 'column' })
	}

	if (skipped.length > 0) {
		slots.push({ id: `spacer:${skipped[0]}`, kind: 'spacer', span: skipped.length })
	}

	if (start.length + scrolling.length > 0) {
		slots.push({ id: 'filler:', kind: 'filler' })
	}

	return [...slots, ...end.map((id): ColumnSlot => ({ id, kind: 'column' }))]
}

/**
 * Render only the scrolling columns near the scroller's viewport, so a table
 * showing every column lays out, paints, and updates the cells in view rather
 * than all of them. Docked columns always render, and spacers hold the place of
 * the rest.
 *
 * @param options The visible columns, the docks, which columns always render,
 *   and how far past the viewport to render.
 *
 * @returns The slots to render in each row, and an attachment for the scroller.
 */
export function createVirtualColumns(options: VirtualColumnsOptions) {
	const overscan = options.overscan ?? 480
	let scrollLeft = $state(0)
	let viewportWidth = $state(0)
	const range = $derived.by(() => {
		const docked = options.docked()
		let left = 0
		let offset = 0
		const offsets = [0]
		for (const column of options.columns()) {
			if (docked.start.includes(column.id)) {
				left += column.getSize()
			} else if (!docked.end.includes(column.id)) {
				offset += column.getSize()
				offsets.push(offset)
			}
		}

		return visibleRange(
			offsets,
			scrollLeft - left - overscan,
			scrollLeft - left + viewportWidth + overscan,
		)
	})
	// Separate numbers, so scrolling within the rendered columns changes nothing downstream
	const start = $derived(range.start)
	const end = $derived(range.end)
	const slots = $derived(
		columnSlots(
			options.columns().map((column) => column.id),
			options.docked(),
			{ start, end },
			options.keep,
		),
	)

	/**
	 * Follow the scroller's position and width.
	 *
	 * @param element The element scrolling the table.
	 *
	 * @returns Stops following the scroller.
	 */
	function scroller(element: HTMLElement) {
		function update() {
			scrollLeft = element.scrollLeft
			viewportWidth = element.clientWidth
		}

		update()
		const resize = new ResizeObserver(update)
		resize.observe(element)
		const stop = on(element, 'scroll', update, { passive: true })
		return () => {
			stop()
			resize.disconnect()
		}
	}

	return {
		scroller: scroller satisfies Attachment<HTMLElement>,
		// The places to render in each row, in display order
		get slots() {
			return slots
		},
	}
}
