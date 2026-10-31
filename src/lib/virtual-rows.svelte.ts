import type { Attachment } from 'svelte/attachments'
import { on } from 'svelte/events'
import { SvelteMap } from 'svelte/reactivity'

type VirtualRowsOptions = {
	/** Row ids in display order. */
	ids: () => readonly string[]
	/** Height rendered beyond each edge of the viewport, in pixels. */
	overscan?: number
}

/** A row's assumed height before any row has been measured. */
const fallbackHeight = 28

/**
 * Find where each row starts, measured from the first row's top.
 *
 * @param ids Row ids in display order.
 * @param heights Measured row heights by id.
 * @param estimate The height of a row not yet measured.
 *
 * @returns Each row's offset, followed by the total height.
 */
export function rowOffsets(
	ids: readonly string[],
	heights: ReadonlyMap<string, number>,
	estimate: number,
): number[] {
	const offsets = [0]
	let offset = 0
	for (const id of ids) {
		offset += heights.get(id) ?? estimate
		offsets.push(offset)
	}

	return offsets
}

// The index of the row spanning `position`, clamped to the rows that exist
function rowAt(offsets: readonly number[], position: number): number {
	let low = 0
	let high = offsets.length - 2
	while (low < high) {
		const middle = Math.ceil((low + high) / 2)
		if ((offsets[middle] ?? 0) <= position) {
			low = middle
		} else {
			high = middle - 1
		}
	}

	return Math.max(0, low)
}

/**
 * Find the rows overlapping a span of the table.
 *
 * @param offsets Each row's offset, followed by the total height, from
 *   `rowOffsets`.
 * @param top The span's top, measured like the offsets.
 * @param bottom The span's bottom.
 *
 * @returns The first overlapping row's index and the index after the last one.
 */
export function visibleRange(
	offsets: readonly number[],
	top: number,
	bottom: number,
): { start: number; end: number } {
	const count = offsets.length - 1
	return count <= 0
		? { start: 0, end: 0 }
		: { start: rowAt(offsets, top), end: Math.min(count, rowAt(offsets, bottom) + 1) }
}

/**
 * Render only the rows of a long table near its scroller's viewport, so
 * resizing, dragging, and scrolling lay out and paint the rows in view rather
 * than all of them. Rows are measured as they render. Rows not yet seen are
 * assumed to be as tall as the average measured row, and spacers above and
 * below the rendered rows stand in for the rest.
 *
 * @param options The rows in display order and how far past the viewport to
 *   render.
 *
 * @returns Attachments for the scroller and each row, and the range to render.
 */
export function createVirtualRows(options: VirtualRowsOptions) {
	const overscan = options.overscan ?? 480
	const heights = new SvelteMap<string, number>()
	let scrollTop = $state(0)
	let viewportHeight = $state(0)
	let observer: ResizeObserver | undefined

	const estimate = $derived.by(() => {
		let total = 0
		for (const height of heights.values()) {
			total += height
		}

		return heights.size === 0 ? fallbackHeight : total / heights.size
	})
	const offsets = $derived(rowOffsets(options.ids(), heights, estimate))
	const range = $derived(
		visibleRange(offsets, scrollTop - overscan, scrollTop + viewportHeight + overscan),
	)
	// Separate numbers, so scrolling within the rendered rows changes nothing downstream
	const start = $derived(range.start)
	const end = $derived(range.end)

	function record(entries: ResizeObserverEntry[]) {
		for (const entry of entries) {
			const id = entry.target instanceof HTMLElement ? entry.target.dataset.repositoryId : undefined
			const height = entry.borderBoxSize[0]?.blockSize
			if (id === undefined || height === undefined || height === 0) {
				continue
			}

			if (heights.get(id) !== height) {
				heights.set(id, height)
			}
		}
	}

	/**
	 * Measure a rendered row as its height changes.
	 *
	 * @param element The row, which carries its id in `data-repository-id`.
	 *
	 * @returns Stops measuring the row.
	 */
	function row(element: HTMLElement) {
		observer ??= new ResizeObserver(record)
		observer.observe(element)
		return () => {
			observer?.unobserve(element)
		}
	}

	/**
	 * Follow the scroller's position and height.
	 *
	 * @param element The element scrolling the table.
	 *
	 * @returns Stops following the scroller.
	 */
	function scroller(element: HTMLElement) {
		function update() {
			scrollTop = element.scrollTop
			viewportHeight = element.clientHeight
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
		// Space for the rows below the rendered ones, in pixels
		get after() {
			return (offsets.at(-1) ?? 0) - (offsets[end] ?? 0)
		},
		// Space for the rows above the rendered ones, in pixels
		get before() {
			return offsets[start] ?? 0
		},
		// The index after the last rendered row
		get end() {
			return end
		},
		row: row satisfies Attachment<HTMLElement>,
		// The height assumed for each row a spacer stands in for: the average measured row
		get rowHeight() {
			return estimate
		},
		scroller: scroller satisfies Attachment<HTMLElement>,
		// The index of the first rendered row
		get start() {
			return start
		},
	}
}
