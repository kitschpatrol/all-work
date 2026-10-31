import { describe, expect, it } from 'vitest'
import { columnSlots } from './virtual-columns.svelte.js'

const ids = ['select', 'path', 'a', 'b', 'c', 'd', 'e', 'run', 'right']
const docked = { start: ['select', 'path'], end: ['right'] }
const none = () => false

describe('columnSlots', () => {
	it('renders every column when the range covers them, with the blank space before the right dock', () => {
		expect(columnSlots(ids, docked, { start: 0, end: 6 }, none)).toEqual([
			{ id: 'select', kind: 'column' },
			{ id: 'path', kind: 'column' },
			...['a', 'b', 'c', 'd', 'e', 'run'].map((id) => ({ id, kind: 'column' })),
			{ id: 'filler:', kind: 'filler' },
			{ id: 'right', kind: 'column' },
		])
	})

	it('joins the scrolling columns outside the range into spacers, keeping docked ones', () => {
		expect(columnSlots(ids, docked, { start: 2, end: 4 }, none)).toEqual([
			{ id: 'select', kind: 'column' },
			{ id: 'path', kind: 'column' },
			{ id: 'spacer:a', kind: 'spacer', span: 2 },
			{ id: 'c', kind: 'column' },
			{ id: 'd', kind: 'column' },
			{ id: 'spacer:e', kind: 'spacer', span: 2 },
			{ id: 'filler:', kind: 'filler' },
			{ id: 'right', kind: 'column' },
		])
	})

	it('renders kept columns wherever they are, splitting the spacers around them', () => {
		expect(
			columnSlots(ids, docked, { start: 0, end: 1 }, (id) => id === 'c' || id === 'run'),
		).toEqual([
			{ id: 'select', kind: 'column' },
			{ id: 'path', kind: 'column' },
			{ id: 'a', kind: 'column' },
			{ id: 'spacer:b', kind: 'spacer', span: 1 },
			{ id: 'c', kind: 'column' },
			{ id: 'spacer:d', kind: 'spacer', span: 2 },
			{ id: 'run', kind: 'column' },
			{ id: 'filler:', kind: 'filler' },
			{ id: 'right', kind: 'column' },
		])
	})

	it('leaves out the blank space when every column is docked right', () => {
		expect(
			columnSlots(['x', 'y'], { start: [], end: ['x', 'y'] }, { start: 0, end: 0 }, none),
		).toEqual([
			{ id: 'x', kind: 'column' },
			{ id: 'y', kind: 'column' },
		])
	})
})
