type ResizableHeader = {
	column: {
		columnDef: { minSize?: number; maxSize?: number }
		getSize: () => number
		id: string
	}
	getResizeHandler: () => (event: MouseEvent | TouchEvent) => void
}

function pointerX(event: MouseEvent | TouchEvent): number | undefined {
	return 'touches' in event ? event.touches[0]?.clientX : event.clientX
}

/**
 * Start a column resize drag. Columns normally resize from their right edge
 * through TanStack's handler. A column pinned to the right edge resizes from
 * its left edge instead, so dragging left widens it.
 */
export function startColumnResize(
	event: MouseEvent | TouchEvent,
	header: ResizableHeader,
	fromLeftEdge: boolean,
	setSize: (size: number) => void,
): void {
	if (!fromLeftEdge) {
		header.getResizeHandler()(event)
		return
	}

	const startX = pointerX(event)
	if (startX === undefined) {
		return
	}

	event.preventDefault()
	const startSize = header.column.getSize()
	const min = header.column.columnDef.minSize ?? 24
	const max = header.column.columnDef.maxSize ?? 4000
	const isTouch = 'touches' in event
	const move = (moveEvent: MouseEvent | TouchEvent) => {
		const x = pointerX(moveEvent)
		if (x !== undefined) {
			setSize(Math.min(max, Math.max(min, startSize + startX - x)))
		}
	}

	const stop = () => {
		document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', move)
		document.removeEventListener(isTouch ? 'touchend' : 'mouseup', stop)
	}

	document.addEventListener(isTouch ? 'touchmove' : 'mousemove', move, { passive: false })
	document.addEventListener(isTouch ? 'touchend' : 'mouseup', stop)
}
