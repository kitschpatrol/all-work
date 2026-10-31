import { describe, expect, it } from 'vitest'
import { rowOffsets, visibleRange } from './virtual-rows.svelte.js'

describe('rowOffsets', () => {
	it('stacks measured rows and assumes the estimate for the rest', () => {
		expect(rowOffsets(['a', 'b', 'c'], new Map([['b', 50]]), 28)).toEqual([0, 28, 78, 106])
	})

	it('describes an empty table as having no height', () => {
		expect(rowOffsets([], new Map(), 28)).toEqual([0])
	})
})

describe('visibleRange', () => {
	const offsets = [0, 28, 56, 84, 112, 140]

	it('includes every row that overlaps the window', () => {
		expect(visibleRange(offsets, 30, 90)).toEqual({ start: 1, end: 4 })
		expect(visibleRange(offsets, 28, 56)).toEqual({ start: 1, end: 3 })
	})

	it('clamps a window reaching past either end of the table', () => {
		expect(visibleRange(offsets, -500, 40)).toEqual({ start: 0, end: 2 })
		expect(visibleRange(offsets, 100, 5000)).toEqual({ start: 3, end: 5 })
		expect(visibleRange(offsets, -500, 5000)).toEqual({ start: 0, end: 5 })
	})

	it('renders nothing for an empty table', () => {
		expect(visibleRange([0], 0, 900)).toEqual({ start: 0, end: 0 })
	})
})
