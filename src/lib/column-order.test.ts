import { describe, expect, it } from 'vitest'
import {
	dockNewestRun,
	getDockPositions,
	getDockSide,
	moveColumn,
	moveColumnToEnd,
	nearestSlot,
	resolveColumnOrder,
	toggleDock,
	undockColumn,
} from './column-order.js'

const docked = { start: ['select', 'path'], end: ['run2'] }
const ids = ['select', 'path', 'name', 'branch', 'version', 'run1', 'run2']

describe('resolveColumnOrder', () => {
	it('keeps definition order when nothing has been rearranged', () => {
		expect(resolveColumnOrder(ids, [], docked)).toEqual(ids)
	})

	it('holds docked columns at their edges regardless of the preferred order', () => {
		expect(resolveColumnOrder(ids, ['run2', 'version', 'path', 'name'], docked)).toEqual([
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
			resolveColumnOrder(ids, ['branch', 'removed-run', 'name', 'branch', 'version'], docked),
		).toEqual(['select', 'path', 'branch', 'name', 'version', 'run1', 'run2'])
	})

	it('moves a formerly movable column to the end edge once it becomes docked', () => {
		const withoutLatest = ids.filter((id) => id !== 'run2')
		expect(
			resolveColumnOrder(withoutLatest, ['run1', 'name', 'branch', 'version'], {
				...docked,
				end: ['run1'],
			}),
		).toEqual(['select', 'path', 'name', 'branch', 'version', 'run1'])
	})

	it('ignores docked ids that are not present', () => {
		expect(resolveColumnOrder(['name', 'branch'], ['branch'], docked)).toEqual(['branch', 'name'])
	})
})

describe('moveColumnToEnd', () => {
	it('moves a column after the other movable columns, hidden ones included', () => {
		expect(moveColumnToEnd(ids, 'name', docked)).toEqual(['branch', 'version', 'run1', 'name'])
	})

	it('appends a column missing from the order', () => {
		expect(moveColumnToEnd(['name', 'branch'], 'version', docked)).toEqual([
			'name',
			'branch',
			'version',
		])
	})

	it('leaves a docked column at its edge', () => {
		expect(moveColumnToEnd(ids, 'run2', docked)).toEqual(['name', 'branch', 'version', 'run1'])
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

describe('docking', () => {
	it('reports the edge a column is docked at', () => {
		expect(getDockSide(docked, 'path')).toBe('start')
		expect(getDockSide(docked, 'run2')).toBe('end')
		expect(getDockSide(docked, 'name')).toBeUndefined()
	})

	it('docks a column beside the scrolling columns on either side', () => {
		expect(toggleDock(docked, 'name', 'start')).toEqual({
			start: ['select', 'path', 'name'],
			end: ['run2'],
		})
		expect(toggleDock(docked, 'name', 'end')).toEqual({
			start: ['select', 'path'],
			end: ['name', 'run2'],
		})
	})

	it('moves a docked column straight to the other edge', () => {
		expect(toggleDock(docked, 'path', 'end')).toEqual({ start: ['select'], end: ['path', 'run2'] })
	})

	it('undocks a column docked at the chosen edge', () => {
		expect(toggleDock(docked, 'path', 'start')).toEqual({ start: ['select'], end: ['run2'] })
		expect(undockColumn(docked, 'run2')).toEqual({ start: ['select', 'path'], end: [] })
	})

	it('docks the newest run at the right edge in place of the run before it', () => {
		expect(dockNewestRun(docked, 'run3', 'run2')).toEqual({
			start: ['select', 'path'],
			end: ['run3'],
		})
		expect(dockNewestRun({ start: [], end: ['name', 'run2'] }, 'run3', 'run2')).toEqual({
			start: [],
			end: ['name', 'run3'],
		})
		expect(dockNewestRun({ start: [], end: [] }, 'run1', undefined)).toEqual({
			start: [],
			end: ['run1'],
		})
	})
})

describe('getDockPositions', () => {
	const column = (id: string, size: number) => ({ getSize: () => size, id })
	const visible = [
		column('select', 32),
		column('path', 200),
		column('name', 100),
		column('branch', 80),
		column('run1', 240),
		column('run2', 300),
	]

	it('offsets each docked column by the dock columns outside it, marking the innermost', () => {
		expect(getDockPositions(visible, { start: ['select', 'path'], end: ['run1', 'run2'] })).toEqual(
			{
				path: { edge: true, offset: 32, side: 'start' },
				run1: { edge: true, offset: 300, side: 'end' },
				run2: { edge: false, offset: 0, side: 'end' },
				select: { edge: false, offset: 0, side: 'start' },
			},
		)
	})

	it('skips hidden docked columns and leaves scrolling columns out', () => {
		expect(getDockPositions(visible, { start: ['select', 'hidden', 'name'], end: [] })).toEqual({
			name: { edge: true, offset: 32, side: 'start' },
			select: { edge: false, offset: 0, side: 'start' },
		})
	})
})
