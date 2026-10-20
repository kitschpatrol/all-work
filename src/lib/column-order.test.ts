import { describe, expect, it } from 'vitest'
import { moveColumn, moveColumnToEnd, nearestSlot, resolveColumnOrder } from './column-order.js'

const pinned = { start: ['select', 'path'], end: ['run2'] }
const ids = ['select', 'path', 'name', 'branch', 'version', 'run1', 'run2']

describe('resolveColumnOrder', () => {
	it('keeps definition order when nothing has been rearranged', () => {
		expect(resolveColumnOrder(ids, [], pinned)).toEqual(ids)
	})

	it('holds pinned columns at their edges regardless of the preferred order', () => {
		expect(resolveColumnOrder(ids, ['run2', 'version', 'path', 'name'], pinned)).toEqual([
			'select',
			'path',
			'version',
			'name',
			'branch',
			'run1',
			'run2',
		])
	})

	it('appends new columns after the preferred ones and drops stale or duplicate ids', () => {
		expect(
			resolveColumnOrder(ids, ['branch', 'removed-run', 'name', 'branch', 'version'], pinned),
		).toEqual(['select', 'path', 'branch', 'name', 'version', 'run1', 'run2'])
	})

	it('moves a formerly movable column to the end edge once it becomes pinned', () => {
		const withoutLatest = ids.filter((id) => id !== 'run2')
		expect(
			resolveColumnOrder(withoutLatest, ['run1', 'name', 'branch', 'version'], {
				...pinned,
				end: ['run1'],
			}),
		).toEqual(['select', 'path', 'name', 'branch', 'version', 'run1'])
	})

	it('ignores pinned ids that are not present', () => {
		expect(resolveColumnOrder(['name', 'branch'], ['branch'], pinned)).toEqual(['branch', 'name'])
	})
})

describe('moveColumnToEnd', () => {
	it('moves a column after the other movable columns, hidden ones included', () => {
		expect(moveColumnToEnd(ids, 'name', pinned)).toEqual(['branch', 'version', 'run1', 'name'])
	})

	it('appends a column missing from the order', () => {
		expect(moveColumnToEnd(['name', 'branch'], 'version', pinned)).toEqual([
			'name',
			'branch',
			'version',
		])
	})

	it('leaves a pinned column at its edge', () => {
		expect(moveColumnToEnd(ids, 'run2', pinned)).toEqual(['name', 'branch', 'version', 'run1'])
	})
})

describe('moveColumn', () => {
	const order = ['name', 'branch', 'version']
	const visible = new Set(order)

	it('moves a column to the start, middle, and end', () => {
		expect(moveColumn(order, 'version', 0, visible)).toEqual(['version', 'name', 'branch'])
		expect(moveColumn(order, 'name', 1, visible)).toEqual(['branch', 'name', 'version'])
		expect(moveColumn(order, 'name', 2, visible)).toEqual(['branch', 'version', 'name'])
	})

	it('returns the same order when the slot matches the current position', () => {
		expect(moveColumn(order, 'branch', 1, visible)).toEqual(order)
	})

	it('places a column relative to visible neighbors around hidden ones', () => {
		const withHidden = ['name', 'hidden', 'branch', 'version', 'later']
		const shown = new Set(['branch', 'name', 'version'])
		expect(moveColumn(withHidden, 'version', 1, shown)).toEqual([
			'name',
			'hidden',
			'version',
			'branch',
			'later',
		])
		expect(moveColumn(withHidden, 'name', 2, shown)).toEqual([
			'hidden',
			'branch',
			'version',
			'name',
			'later',
		])
	})

	it('treats an out-of-range slot as the end', () => {
		expect(moveColumn(order, 'name', 99, visible)).toEqual(['branch', 'version', 'name'])
	})

	it('handles a lone column', () => {
		expect(moveColumn(['name'], 'name', 0, new Set(['name']))).toEqual(['name'])
		expect(moveColumn(['hidden', 'name'], 'name', 0, new Set(['name']))).toEqual(['hidden', 'name'])
	})
})

describe('nearestSlot', () => {
	const widths = [100, 40, 200]

	it('stays put at each resting position', () => {
		expect(nearestSlot(widths, 0)).toBe(0)
		expect(nearestSlot(widths, 100)).toBe(1)
		expect(nearestSlot(widths, 140)).toBe(2)
		expect(nearestSlot(widths, 340)).toBe(3)
	})

	it('swaps once the drag passes half of the neighbor width', () => {
		expect(nearestSlot(widths, 49)).toBe(0)
		expect(nearestSlot(widths, 50)).toBe(0)
		expect(nearestSlot(widths, 51)).toBe(1)
		expect(nearestSlot(widths, 239)).toBe(2)
		expect(nearestSlot(widths, 241)).toBe(3)
	})

	it('clamps positions outside the region to the nearest edge', () => {
		expect(nearestSlot(widths, -500)).toBe(0)
		expect(nearestSlot(widths, 5000)).toBe(3)
		expect(nearestSlot([], 80)).toBe(0)
	})
})
