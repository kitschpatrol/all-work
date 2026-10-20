/** Column ids held at either edge of the table, outside the reorderable region. */
export type PinnedColumns = { start: string[]; end: string[] }

/**
 * Arrange every column id for display. Pinned columns keep their edges, the
 * movable columns follow `preferred`, and movable columns missing from it (such
 * as new command runs) keep their definition order after the preferred ones.
 * Ids in `preferred` that no longer exist or are pinned are ignored.
 */
export function resolveColumnOrder(
	ids: string[],
	preferred: string[],
	pinned: PinnedColumns,
): string[] {
	const available = new Set(ids)
	const fixed = new Set([...pinned.start, ...pinned.end])
	const movable = ids.filter((id) => !fixed.has(id))
	const movableIds = new Set(movable)
	// Set#intersection may iterate the other set, which would lose the preferred order
	// eslint-disable-next-line unicorn/prefer-set-methods
	const placed = [...new Set(preferred)].filter((id) => movableIds.has(id))
	const placedIds = new Set(placed)
	return [
		...pinned.start.filter((id) => available.has(id)),
		...placed,
		...movable.filter((id) => !placedIds.has(id)),
		...pinned.end.filter((id) => available.has(id)),
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
 * Move `id` after every movable column in `order`, hidden ones included. Like a
 * drag, the result leaves out pinned ids, which keep their edges.
 */
export function moveColumnToEnd(order: string[], id: string, pinned: PinnedColumns): string[] {
	const fixed = new Set([...pinned.start, ...pinned.end])
	return [...order.filter((entry) => entry !== id), id].filter((entry) => !fixed.has(entry))
}

/**
 * Choose the slot for a dragged column whose left edge sits `offset` pixels
 * into the movable region. `widths` are the other visible movable columns in
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
