import { describe, expect, it } from 'vitest'
import { slotBorders } from './column-drag.js'

// A 1000px table: 232px docked left, 300px scrolling, 268px blank, then two 100px columns docked right
const fitting = { blankEnd: 800, blankStart: 532, width: 1000 }

describe('slotBorders', () => {
	it('casts no shadow from the blank space before the right dock', () => {
		expect(slotBorders(800, 900, fitting)).toEqual({ left: false, right: true })
	})

	it('casts no shadow from the table edge beyond the right dock', () => {
		expect(slotBorders(900, 1000, fitting)).toEqual({ left: true, right: false })
	})

	it('casts no shadow into a scrolling slot from the blank space after it', () => {
		expect(slotBorders(382, 532, fitting)).toEqual({ left: true, right: false })
	})

	it('casts shadows from columns on both sides', () => {
		expect(slotBorders(32, 232, fitting)).toEqual({ left: true, right: true })
		expect(slotBorders(232, 382, fitting)).toEqual({ left: true, right: true })
	})

	it('casts no shadow from the table edge on the left', () => {
		expect(slotBorders(0, 150, fitting)).toEqual({ left: false, right: true })
	})

	it('finds a column beside the right dock once the table is too wide for blank space', () => {
		const overflowing = { blankEnd: 1000, blankStart: 1000, width: 1200 }
		expect(slotBorders(1000, 1100, overflowing)).toEqual({ left: true, right: true })
		expect(slotBorders(1100, 1200, overflowing)).toEqual({ left: true, right: false })
	})
})
