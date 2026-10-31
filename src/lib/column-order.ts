/**
 * Column ids docked at either edge of the table, in display order, outside the
 * scrolling region.
 */
export type DockedColumns = { start: string[]; end: string[] }

/** The table edge a column is docked at. */
export type DockSide = keyof DockedColumns

/** The edge `id` is docked at, or `undefined` while it scrolls with the table. */
export function getDockSide(docked: DockedColumns, id: string): DockSide | undefined {
	return docked.start.includes(id) ? 'start' : docked.end.includes(id) ? 'end' : undefined
}

/** Take `id` out of both docks. */
export function undockColumn(docked: DockedColumns, id: string): DockedColumns {
	return {
		start: docked.start.filter((entry) => entry !== id),
		end: docked.end.filter((entry) => entry !== id),
	}
}

/**
 * Dock `id` at `side`, beside the scrolling columns, or undock it when it is
 * docked there already.
 */
export function toggleDock(docked: DockedColumns, id: string, side: DockSide): DockedColumns {
	const without = undockColumn(docked, id)
	if (docked[side].includes(id)) {
		return without
	}

	return side === 'start'
		? { ...without, start: [...without.start, id] }
		: { ...without, end: [id, ...without.end] }
}

/**
 * Dock a run that just started at the table's right edge, where the run docked
 * there before scrolls free, so the newest output stays in view.
 */
export function dockNewestRun(
	docked: DockedColumns,
	runId: string,
	previousRunId: string | undefined,
): DockedColumns {
	const without = undockColumn(docked, runId)
	return {
		...without,
		end: [...without.end.filter((entry) => entry !== previousRunId), runId],
	}
}

/**
 * Arrange every column id for display. Docked columns keep their edges in dock
 * order, the scrolling columns follow `preferred`, and scrolling columns
 * missing from it (such as new command runs) keep their definition order after
 * the preferred ones. Ids in `preferred` that no longer exist or are docked are
 * ignored.
 */
export function resolveColumnOrder(
	ids: string[],
	preferred: string[],
	docked: DockedColumns,
): string[] {
	const available = new Set(ids)
	const fixed = new Set([...docked.start, ...docked.end])
	const movable = ids.filter((id) => !fixed.has(id))
	const movableIds = new Set(movable)
	// Set#intersection may iterate the other set, which would lose the preferred order
	// eslint-disable-next-line unicorn/prefer-set-methods
	const placed = [...new Set(preferred)].filter((id) => movableIds.has(id))
	const placedIds = new Set(placed)
	return [
		...docked.start.filter((id) => available.has(id)),
		...placed,
		...movable.filter((id) => !placedIds.has(id)),
		...docked.end.filter((id) => available.has(id)),
	]
}

/**
 * Move `id` to `slot`, counted among the visible ids in `order` other than
 * `id`. Hidden ids keep their places relative to their visible neighbors.
 */
export function moveColumn(
	order: string[],
	id: string,
	slot: number,
	visible: ReadonlySet<string>,
): string[] {
	const rest = order.filter((entry) => entry !== id)
	const others = rest.filter((entry) => visible.has(entry))
	const before = others[slot]
	const after = others.at(-1)
	const index =
		before === undefined
			? after === undefined
				? rest.length
				: rest.indexOf(after) + 1
			: rest.indexOf(before)
	return [...rest.slice(0, index), id, ...rest.slice(index)]
}

/**
 * Move `id` after every scrolling column in `order`, hidden ones included. Like
 * a drag, the result leaves out docked ids, which keep their edges.
 */
export function moveColumnToEnd(order: string[], id: string, docked: DockedColumns): string[] {
	const fixed = new Set([...docked.start, ...docked.end])
	return [...order.filter((entry) => entry !== id), id].filter((entry) => !fixed.has(entry))
}

/**
 * Choose the slot for a dragged column whose left edge sits `offset` pixels
 * into its region. `widths` are the other visible columns of the region in
 * order, so slot `n` rests after the first `n` of them. The closest resting
 * position wins, which swaps a neighbor once the drag covers half of its
 * width.
 */
export function nearestSlot(widths: number[], offset: number): number {
	let slot = 0
	let distance = Math.abs(offset)
	let position = 0
	for (const [index, width] of widths.entries()) {
		position += width
		const next = Math.abs(offset - position)
		if (next >= distance) {
			continue
		}

		slot = index + 1
		distance = next
	}

	return slot
}

type DockPosition = {
	/**
	 * Whether the column is the dock's innermost, casting a shadow onto the
	 * scrolling columns.
	 */
	edge: boolean
	/** Distance from the dock's edge of the scroller, where the column sticks. */
	offset: number
	side: DockSide
}

/**
 * Where each visible docked column sticks: its offset from the scroller edge is
 * the width of the dock's columns outside it.
 */
export function getDockPositions(
	columns: Array<{ getSize: () => number; id: string }>,
	docked: DockedColumns,
): Record<string, DockPosition> {
	const positions: Record<string, DockPosition> = {}
	const start = columns.filter((column) => docked.start.includes(column.id))
	const end = columns.filter((column) => docked.end.includes(column.id)).toReversed()
	for (const [side, dock] of [
		['start', start],
		['end', end],
	] as const) {
		let offset = 0
		for (const [index, column] of dock.entries()) {
			positions[column.id] = { edge: index === dock.length - 1, offset, side }
			offset += column.getSize()
		}
	}

	return positions
}
