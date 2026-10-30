import { describe, expect, it } from 'vitest'
import { textLinesBeside } from './row-text-lines.js'

describe('textLinesBeside', () => {
	it('keeps one line in rows too short to wrap', () => {
		expect(textLinesBeside(0)).toBe(1)
		expect(textLinesBeside(31)).toBe(1)
	})

	it('adds a line once a whole line fits inside the cell padding', () => {
		expect(textLinesBeside(32)).toBe(2)
		expect(textLinesBeside(45)).toBe(2)
		expect(textLinesBeside(46)).toBe(3)
	})

	it('fits the rows that three lines of output make', () => {
		expect(textLinesBeside(70)).toBe(4)
	})
})
