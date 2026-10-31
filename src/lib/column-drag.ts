import { tick } from 'svelte'
import type { DockedColumns } from './column-order.js'
import { moveColumn, nearestSlot } from './column-order.js'

type DragColumn = { getSize: () => number; id: string }

/** Where a column sits: docked at an edge, or scrolling between the docks. */
type ColumnRegion = 'center' | keyof DockedColumns

type ColumnDragOptions = {
	/** Visible leaf columns in display order. */
	columns: () => DragColumn[]
	/** Columns docked at either edge, fixed ones included. */
	docked: () => DockedColumns
	/** Columns at the front of the start dock that never move. */
	fixed: readonly string[]
	/** The column being dragged. */
	id: string
	/** Receives the dragged column id as a drag begins, then `undefined`. */
	onDragging: (id: string | undefined) => void
	/**
	 * Receives the new order of the region's movable columns, hidden ones
	 * included and fixed ones left out.
	 */
	onReorder: (region: ColumnRegion, order: string[]) => void
	/** The full display order, docked columns included. */
	order: () => string[]
	/** The table's scroller, whose cells carry `data-column-id`. */
	scroller: HTMLElement
}

/** What borders one side of a dragged column's slot. */
export type SlotSide = 'blank' | 'column' | 'edge'

type Layout = {
	/** The region's movable visible columns in order. */
	columns: Array<{ id: string; width: number }>
	endWidth: number
	/** Visible width before the region's first movable column. */
	leading: number
	region: ColumnRegion
	startWidth: number
	/** The width of every visible column. */
	totalWidth: number
}

const dragThreshold = 4
const edgeZone = 32
const maxScrollStep = 16
const slideOptions: KeyframeAnimationOptions = { duration: 150, easing: 'ease-out' }
let latestDrag = 0
// Running slides by column, replaced without asking every cell for its animations
const slides = new Map<string, Animation[]>()

function columnElements(scroller: HTMLElement, id: string) {
	return [...scroller.querySelectorAll<HTMLElement>(`[data-column-id="${CSS.escape(id)}"]`)]
}

function headerLeft(scroller: HTMLElement, id: string) {
	return scroller.querySelector(`th[data-column-id="${CSS.escape(id)}"]`)?.getBoundingClientRect()
		.left
}

function cancelSlide(id: string) {
	const running = slides.get(id) ?? []
	for (const animation of running) {
		animation.cancel()
	}

	slides.delete(id)
}

function slide(scroller: HTMLElement, id: string, from: number) {
	cancelSlide(id)
	const animations = columnElements(scroller, id).map((element) =>
		element.animate(
			[{ transform: `translateX(${from}px)` }, { transform: 'translateX(0)' }],
			// Added to any transform the element already has, such as a neighbor's shift
			{ ...slideOptions, composite: 'add' },
		),
	)
	slides.set(id, animations)
	void Promise.allSettled(animations.map(async (animation) => animation.finished)).then(() => {
		if (slides.get(id) === animations) {
			slides.delete(id)
		}
	})
	return animations
}

/**
 * Decide which sides of a dragged column's slot another column borders, to cast
 * an inner shadow into it. Blank space before the right dock and the table's
 * edges cast none.
 *
 * @param left The slot's left edge, measured from the table's left edge.
 * @param right The slot's right edge.
 * @param table The table.
 * @param table.blankStart Where the blank space before the right dock starts.
 * @param table.blankEnd Where that blank space ends, matching its start when
 *   there is none.
 * @param table.width The table's width.
 *
 * @returns What borders the slot on its left and on its right: another column,
 *   the blank space, or the table's edge.
 */
export function slotBorders(
	left: number,
	right: number,
	table: { blankEnd: number; blankStart: number; width: number },
): { left: SlotSide; right: SlotSide } {
	const blank = table.blankEnd - table.blankStart >= 1
	return {
		left: left < 1 ? 'edge' : blank && Math.abs(left - table.blankEnd) < 1 ? 'blank' : 'column',
		right:
			right > table.width - 1
				? 'edge'
				: blank && Math.abs(right - table.blankStart) < 1
					? 'blank'
					: 'column',
	}
}

function totalWidth(columns: Layout['columns']) {
	return columns.reduce((sum, column) => sum + column.width, 0)
}

function swallowClick(event: MouseEvent) {
	event.preventDefault()
	event.stopPropagation()
}

function suppressNextClick() {
	addEventListener('click', swallowClick, { capture: true, once: true })
	setTimeout(() => {
		removeEventListener('click', swallowClick, { capture: true })
	}, 0)
}

function measure(
	columns: DragColumn[],
	docked: DockedColumns,
	fixed: readonly string[],
	id: string,
): Layout {
	const region: ColumnRegion = docked.start.includes(id)
		? 'start'
		: docked.end.includes(id)
			? 'end'
			: 'center'
	const width = (ids: readonly string[]) =>
		columns
			.filter((column) => ids.includes(column.id))
			.reduce((sum, column) => sum + column.getSize(), 0)
	const inRegion = (columnId: string) =>
		region === 'center'
			? !docked.start.includes(columnId) && !docked.end.includes(columnId)
			: docked[region].includes(columnId)
	return {
		columns: columns
			.filter((column) => inRegion(column.id) && !fixed.includes(column.id))
			.map((column) => ({ id: column.id, width: column.getSize() })),
		endWidth: width(docked.end),
		leading: region === 'center' ? width(docked.start) : region === 'start' ? width(fixed) : 0,
		region,
		startWidth: width(docked.start),
		totalWidth: columns.reduce((sum, column) => sum + column.getSize(), 0),
	}
}

/**
 * Where a region's first movable column rests, measured from the table's left
 * edge. The docks stick to the scroller's edges, so theirs move with the scroll
 * position.
 */
function regionLeft(scroller: HTMLElement, layout: Layout) {
	switch (layout.region) {
		case 'center': {
			return layout.leading
		}

		case 'end': {
			return scroller.scrollLeft + scroller.clientWidth - layout.endWidth
		}

		case 'start': {
			return scroller.scrollLeft + layout.leading
		}
	}
}

/**
 * Track a press on a column header and reorder the column as in the macOS
 * Finder. Past a small threshold the column follows the pointer within its
 * region, neighbors slide aside once it covers half their width, and the table
 * scrolls while a scrolling column nears either dock. Until the drop, columns
 * only move by transforms, so a drag never lays out the table again; releasing
 * commits the new order once and settles every column into place. The click
 * that ends a drag is swallowed, so a drag never sorts. A press that never
 * crosses the threshold stays a click.
 */
export function startColumnDrag(event: PointerEvent, options: ColumnDragOptions): void {
	const { id, scroller } = options
	if (event.button !== 0 || options.fixed.includes(id)) {
		return
	}

	const layout = () => measure(options.columns(), options.docked(), options.fixed, id)
	const originX = event.clientX
	const originScroll = scroller.scrollLeft
	let originIndex = 0
	let originPosition = 0
	let pointerX = originX
	let offset = 0
	let slot = 0
	let slotEdge: string | undefined
	let slotLeft: number | undefined
	// Whether a column borders the slot on each side, as last set on the scroller
	const slotSides = new Map<string, boolean>()
	let tableWidth = 0
	let blankBeside = false
	let drag: number | undefined
	let frame: number | undefined
	// Measured once as the drag begins, so each frame avoids a forced layout
	let bounds = new DOMRect()
	// Columns slid aside to open the slot, by how far
	const shifts = new Map<string, number>()
	// Rows that render mid-drag, as the table scrolls, take on the columns' transforms
	const rows = new MutationObserver(() => {
		setTransform(id, offset)
		for (const [columnId, shift] of shifts) {
			setTransform(columnId, shift)
		}

		markSlotEdge(slotEdge)
		markDockEdge(layout())
		if (blankBeside) {
			markBlankBeside(true)
		}
	})

	// Writes only cells that differ, so a column already in place restyles nothing
	function setTransform(columnId: string, shift: number) {
		const transform = shift === 0 ? '' : `translateX(${shift}px)`
		for (const element of columnElements(scroller, columnId)) {
			if (element.style.transform !== transform) {
				element.style.transform = transform
			}
		}
	}

	// The column right of the open slot draws the edge the dragged column carried away
	function markSlotEdge(columnId: string | undefined) {
		if (slotEdge !== columnId) {
			for (const element of scroller.querySelectorAll<HTMLElement>('[data-slot-edge]')) {
				delete element.dataset.slotEdge
			}
		}

		slotEdge = columnId
		if (columnId !== undefined) {
			for (const element of columnElements(scroller, columnId)) {
				element.dataset.slotEdge = ''
			}
		}
	}

	/*
	 * Inside a dock, the column showing innermost casts the dock's shadow. The
	 * column innermost in the DOM carries the dock's class until the drop, so
	 * while the two differ, marks override it: "true" on the one showing there,
	 * "false" on the one with the class.
	 */
	function markDockEdge(current: Layout) {
		if (current.region === 'center') {
			return
		}

		const others = current.columns.filter((column) => column.id !== id)
		const innermost = current.region === 'start' ? others.length : 0
		const showing =
			slot === innermost ? id : current.region === 'start' ? others.at(-1)?.id : others[0]?.id
		const classed = current.region === 'start' ? current.columns.at(-1)?.id : current.columns[0]?.id
		for (const column of current.columns) {
			const mark =
				showing === classed
					? undefined
					: column.id === showing
						? 'true'
						: column.id === classed
							? 'false'
							: undefined
			for (const element of columnElements(scroller, column.id)) {
				if (element.dataset.dockEdge === mark) {
					continue
				}

				if (mark === undefined) {
					delete element.dataset.dockEdge
				} else {
					element.dataset.dockEdge = mark
				}
			}
		}
	}

	/*
	 * The slot's inner shadows fall from the columns beside it. A side bordering
	 * the blank space before the right dock, or the table's edge, has no column
	 * to cast one.
	 */
	function markSlotSides(current: Layout) {
		const others = current.columns.filter((column) => column.id !== id)
		const blankEnd = tableWidth - current.endWidth
		const left =
			(current.region === 'end' ? blankEnd : current.leading) + totalWidth(others.slice(0, slot))
		const borders = slotBorders(left, left + (current.columns[originIndex]?.width ?? 0), {
			blankEnd,
			blankStart: current.totalWidth - current.endWidth,
			width: tableWidth,
		})
		const sides = {
			'--column-drag-slot-left-edge': borders.left === 'column',
			'--column-drag-slot-right-edge': borders.right === 'column',
		}
		if ((borders.right === 'blank') !== blankBeside) {
			markBlankBeside(borders.right === 'blank')
		}

		for (const [property, bordered] of Object.entries(sides)) {
			if (slotSides.get(property) === bordered) {
				continue
			}

			slotSides.set(property, bordered)
			scroller.style.setProperty(property, bordered ? '1' : '0')
		}
	}

	// The blank space's edge shadow falls from the column before it, so it waits while the slot sits there empty
	function markBlankBeside(beside: boolean) {
		blankBeside = beside
		for (const element of scroller.querySelectorAll<HTMLElement>('.table-filler')) {
			if (beside === (element.dataset.slotBeside !== undefined)) {
				continue
			}

			if (beside) {
				element.dataset.slotBeside = ''
			} else {
				delete element.dataset.slotBeside
			}
		}
	}

	function autoScroll(current: Layout) {
		const leftEdge = bounds.left + current.startWidth + edgeZone
		const rightEdge = bounds.right - current.endWidth - edgeZone
		const depth = pointerX < leftEdge ? pointerX - leftEdge : Math.max(0, pointerX - rightEdge)
		scroller.scrollLeft += Math.max(-1, Math.min(1, depth / edgeZone)) * maxScrollStep
	}

	function regionOrder(current: Layout) {
		const docked = options.docked()
		switch (current.region) {
			case 'center': {
				const fixed = new Set([...docked.start, ...docked.end])
				return options.order().filter((columnId) => !fixed.has(columnId))
			}

			case 'end': {
				return docked.end
			}

			case 'start': {
				return docked.start.filter((columnId) => !options.fixed.includes(columnId))
			}
		}
	}

	// Slide the columns between the dragged column's own place and `next` aside by its width
	function openSlot(current: Layout, next: number) {
		const width = current.columns[originIndex]?.width ?? 0
		const others = current.columns.filter((column) => column.id !== id)
		for (const [index, column] of others.entries()) {
			const shift =
				index >= next && index < originIndex
					? width
					: index >= originIndex && index < next
						? -width
						: 0
			const previous = shifts.get(column.id) ?? 0
			if (shift === previous) {
				continue
			}

			shifts.set(column.id, shift)
			setTransform(column.id, shift)
			slide(scroller, column.id, previous - shift)
		}

		markSlotEdge(others[next]?.id)
		markDockEdge(current)
		markSlotSides(current)
	}

	function update() {
		frame = undefined
		const current = layout()
		if (current.columns[originIndex]?.id !== id) {
			finish()
			return
		}

		if (current.region === 'center') {
			autoScroll(current)
		}

		const others = current.columns.filter((column) => column.id !== id)
		// Docked columns stick to the scroller's edge, so only the scrolling region moves with the scroll
		const scrolled = current.region === 'center' ? scroller.scrollLeft - originScroll : 0
		const position = Math.min(
			Math.max(originPosition + pointerX - originX + scrolled, 0),
			totalWidth(others),
		)
		const next = nearestSlot(
			others.map((column) => column.width),
			position,
		)
		if (next !== slot) {
			slot = next
			openSlot(current, next)
		}

		const left = regionLeft(scroller, current) + totalWidth(others.slice(0, slot))
		if (left !== slotLeft) {
			slotLeft = left
			scroller.style.setProperty('--column-drag-slot-left', `${left}px`)
		}

		if (position - originPosition !== offset) {
			offset = position - originPosition
			setTransform(id, offset)
		}

		frame = requestAnimationFrame(update)
	}

	function move(moveEvent: PointerEvent) {
		pointerX = moveEvent.clientX
		if (drag !== undefined || Math.abs(pointerX - originX) < dragThreshold) {
			return
		}

		const current = layout()
		const index = current.columns.findIndex((column) => column.id === id)
		const column = current.columns[index]
		if (column === undefined || current.columns.length < 2) {
			return
		}

		latestDrag += 1
		drag = latestDrag
		bounds = scroller.getBoundingClientRect()
		originIndex = index
		slot = index
		originPosition = totalWidth(current.columns.slice(0, index))
		slotLeft = regionLeft(scroller, current) + originPosition
		scroller.style.setProperty('--column-drag-slot-left', `${slotLeft}px`)
		scroller.style.setProperty('--column-drag-slot-width', `${column.width}px`)
		// The table fills the scroller at least, and its width holds still while a column moves
		tableWidth = Math.max(scroller.clientWidth, current.totalWidth)
		markSlotSides(current)
		// Hover states and tooltips would flicker beneath the pointer while the column moves, so the header keeps the pointer
		scroller
			.querySelector(`th[data-column-id="${CSS.escape(id)}"]`)
			?.setPointerCapture(moveEvent.pointerId)
		document.documentElement.classList.add('column-dragging')
		options.onDragging(id)
		markSlotEdge(current.columns[index + 1]?.id)
		const body = scroller.querySelector('tbody')
		if (body !== null) {
			rows.observe(body, { childList: true })
		}

		frame = requestAnimationFrame(update)
	}

	// Commit the order, then slide every column from where it shows to its new place
	async function settle(settled: number) {
		const current = layout()
		const ids = current.columns.map((column) => column.id)
		const before = new Map(ids.map((columnId) => [columnId, headerLeft(scroller, columnId)]))
		if (slot !== originIndex && current.columns[originIndex]?.id === id) {
			const others = current.columns.filter((column) => column.id !== id)
			options.onReorder(
				current.region,
				moveColumn(regionOrder(current), id, slot, new Set(others.map((column) => column.id))),
			)
		}

		await tick()
		markSlotEdge(undefined)
		// The committed order moved the dock's class to the column showing innermost
		for (const element of scroller.querySelectorAll<HTMLElement>('[data-dock-edge]')) {
			delete element.dataset.dockEdge
		}

		// The dragged column lands in the slot beside the blank space and casts its edge shadow again
		if (blankBeside) {
			markBlankBeside(false)
		}

		for (const columnId of ids) {
			cancelSlide(columnId)
			setTransform(columnId, 0)
		}

		shifts.clear()
		offset = 0
		// Ending the drag only now lets the shadows fade from cells the new order moved
		document.documentElement.classList.remove('column-dragging')
		const animations = ids.flatMap((columnId) => {
			const from = before.get(columnId)
			const to = headerLeft(scroller, columnId)
			return from === undefined || to === undefined || Math.abs(from - to) < 1
				? []
				: slide(scroller, columnId, from - to)
		})
		// The header's shadow transition represents every cell, including a drop with no slide.
		const shadows =
			columnElements(scroller, id)[0]
				?.getAnimations()
				.filter(
					(animation) =>
						animation instanceof CSSTransition &&
						animation.transitionProperty === '--column-drag-shadow-opacity',
				) ?? []
		await Promise.allSettled(
			[...animations, ...shadows].map(async (animation) => animation.finished),
		)
		// A newer drag owns the dragging state now
		if (settled !== latestDrag) {
			return
		}

		scroller.style.removeProperty('--column-drag-slot-left')
		scroller.style.removeProperty('--column-drag-slot-width')
		scroller.style.removeProperty('--column-drag-slot-left-edge')
		scroller.style.removeProperty('--column-drag-slot-right-edge')
		options.onDragging(undefined)
	}

	function finish() {
		removeEventListener('pointermove', move)
		removeEventListener('pointerup', finish)
		removeEventListener('pointercancel', finish)
		removeEventListener('blur', finish)
		rows.disconnect()
		if (frame !== undefined) {
			cancelAnimationFrame(frame)
			frame = undefined
		}

		if (drag === undefined) {
			return
		}

		const settled = drag
		drag = undefined
		suppressNextClick()
		void settle(settled)
	}

	addEventListener('pointermove', move)
	addEventListener('pointerup', finish)
	addEventListener('pointercancel', finish)
	addEventListener('blur', finish)
}
