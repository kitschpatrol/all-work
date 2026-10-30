import { tick } from 'svelte'
import type { PinnedColumns } from './column-order.js'
import { moveColumn, nearestSlot } from './column-order.js'

type DragColumn = { getSize: () => number; id: string }

type ColumnDragOptions = {
	/** Visible leaf columns in display order. */
	columns: () => DragColumn[]
	/** The column being dragged. */
	id: string
	/** Receives the dragged column id as a drag begins, then `undefined`. */
	onDragging: (id: string | undefined) => void
	/** Receives the new order of the movable columns, hidden ones included. */
	onReorder: (order: string[]) => void
	/** The full display order, pinned columns included. */
	order: () => string[]
	pinned: () => PinnedColumns
	/** The table's scroller, whose cells carry `data-column-id`. */
	scroller: HTMLElement
}

type Layout = {
	columns: Array<{ id: string; width: number }>
	endWidth: number
	startWidth: number
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
			slideOptions,
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

function measure(columns: DragColumn[], pinned: PinnedColumns): Layout {
	const fixed = new Set([...pinned.start, ...pinned.end])
	const width = (ids: string[]) =>
		columns
			.filter((column) => ids.includes(column.id))
			.reduce((sum, column) => sum + column.getSize(), 0)
	return {
		columns: columns
			.filter((column) => !fixed.has(column.id))
			.map((column) => ({ id: column.id, width: column.getSize() })),
		endWidth: width(pinned.end),
		startWidth: width(pinned.start),
	}
}

/**
 * Track a press on an unpinned column header and reorder the column as in the
 * macOS Finder. Past a small threshold the column follows the pointer within
 * the movable region, neighbors slide aside once it covers half their width,
 * and the table scrolls while the pointer is near either pinned edge. Releasing
 * settles the column into its slot and swallows the click, so a drag never
 * sorts. A press that never crosses the threshold stays a click.
 */
export function startColumnDrag(event: PointerEvent, options: ColumnDragOptions): void {
	const { id, scroller } = options
	if (
		event.button !== 0 ||
		options.pinned().start.includes(id) ||
		options.pinned().end.includes(id)
	) {
		return
	}

	const layout = () => measure(options.columns(), options.pinned())
	const originX = event.clientX
	const originScroll = scroller.scrollLeft
	let originLeft = 0
	let pointerX = originX
	let offset = 0
	let drag: number | undefined
	let frame: number | undefined
	// Measured once as the drag begins, so each frame avoids a forced layout
	let bounds = new DOMRect()

	function setOffset(next: number) {
		offset = next
		for (const element of columnElements(scroller, id)) {
			element.style.transform = next === 0 ? '' : `translateX(${next}px)`
		}
	}

	function autoScroll(current: Layout) {
		const leftEdge = bounds.left + current.startWidth + edgeZone
		const rightEdge = bounds.right - current.endWidth - edgeZone
		const depth = pointerX < leftEdge ? pointerX - leftEdge : Math.max(0, pointerX - rightEdge)
		scroller.scrollLeft += Math.max(-1, Math.min(1, depth / edgeZone)) * maxScrollStep
	}

	function reorder(current: Layout, slot: number) {
		const index = current.columns.findIndex((column) => column.id === id)
		const others = current.columns.filter((column) => column.id !== id)
		const displaced = others.slice(Math.min(index, slot), Math.max(index, slot))
		const before = new Map(displaced.map((column) => [column.id, headerLeft(scroller, column.id)]))
		const fixed = new Set([...options.pinned().start, ...options.pinned().end])
		options.onReorder(
			moveColumn(
				options.order().filter((columnId) => !fixed.has(columnId)),
				id,
				slot,
				new Set(others.map((column) => column.id)),
			),
		)
		void tick().then(() => {
			for (const [columnId, left] of before) {
				cancelSlide(columnId)
				const after = headerLeft(scroller, columnId)
				if (left !== undefined && after !== undefined && Math.abs(left - after) >= 1) {
					slide(scroller, columnId, left - after)
				}
			}
		})
	}

	function update() {
		frame = undefined
		const current = layout()
		const index = current.columns.findIndex((column) => column.id === id)
		if (index === -1) {
			finish()
			return
		}

		autoScroll(current)
		const others = current.columns.filter((column) => column.id !== id)
		const shift = pointerX - originX + scroller.scrollLeft - originScroll
		const left = Math.min(
			Math.max(originLeft + shift, current.startWidth),
			current.startWidth + totalWidth(others),
		)
		const slot = nearestSlot(
			others.map((column) => column.width),
			left - current.startWidth,
		)
		if (slot !== index) {
			reorder(current, slot)
		}

		const resting = current.startWidth + totalWidth(others.slice(0, slot))
		if (slot !== index || left - resting !== offset) {
			scroller.style.setProperty('--column-drag-slot-left', `${resting}px`)
			setOffset(left - resting)
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
		if (column === undefined) {
			return
		}

		latestDrag += 1
		drag = latestDrag
		bounds = scroller.getBoundingClientRect()
		originLeft = current.startWidth + totalWidth(current.columns.slice(0, index))
		scroller.style.setProperty('--column-drag-slot-left', `${originLeft}px`)
		scroller.style.setProperty('--column-drag-slot-width', `${column.width}px`)
		document.documentElement.classList.add('column-dragging')
		options.onDragging(id)
		frame = requestAnimationFrame(update)
	}

	function finish() {
		removeEventListener('pointermove', move)
		removeEventListener('pointerup', finish)
		removeEventListener('pointercancel', finish)
		removeEventListener('blur', finish)
		if (frame !== undefined) {
			cancelAnimationFrame(frame)
			frame = undefined
		}

		if (drag === undefined) {
			return
		}

		const settled = drag
		drag = undefined
		document.documentElement.classList.remove('column-dragging')
		suppressNextClick()
		const settling = offset
		setOffset(0)
		const animations = settling === 0 ? [] : slide(scroller, id, settling)
		// The header's shadow transition represents every cell, including a drop with no slide.
		const shadows =
			columnElements(scroller, id)[0]
				?.getAnimations()
				.filter(
					(animation) =>
						animation instanceof CSSTransition &&
						animation.transitionProperty === '--column-drag-shadow-opacity',
				) ?? []
		void Promise.allSettled(
			[...animations, ...shadows].map(async (animation) => animation.finished),
		).then(() => {
			// A newer drag owns the dragging state now
			if (settled !== latestDrag) {
				return
			}

			scroller.style.removeProperty('--column-drag-slot-left')
			scroller.style.removeProperty('--column-drag-slot-width')
			options.onDragging(undefined)
		})
	}

	addEventListener('pointermove', move)
	addEventListener('pointerup', finish)
	addEventListener('pointercancel', finish)
	addEventListener('blur', finish)
}
