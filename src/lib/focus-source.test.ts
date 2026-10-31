import { describe, expect, it } from 'vitest'
import { createFocusSource } from './focus-source.js'

function field() {
	const marks: boolean[] = []
	return {
		marks,
		toggleAttribute(name: string, force?: boolean) {
			expect(name).toBe('data-pointer-focus')
			marks.push(force === true)
			return force === true
		},
	}
}

const key = (name: string, editing = false, modifiers = {}) => ({
	altKey: false,
	ctrlKey: false,
	editing,
	key: name,
	metaKey: false,
	...modifiers,
})

describe('focus source', () => {
	it('marks a control the pointer focused, and not one the keyboard reached', () => {
		const source = createFocusSource()
		const clicked = field()
		const tabbed = field()
		source.pointerdown()
		source.focus(clicked)
		source.keydown(key('Tab'))
		source.focus(tabbed)
		expect(clicked.marks).toEqual([true])
		expect(tabbed.marks).toEqual([false])
	})

	it('keeps treating focus as the pointer’s while typing in a field it focused', () => {
		const source = createFocusSource()
		const search = field()
		source.pointerdown()
		source.focus(search)
		source.keydown(key('a', true))
		source.keydown(key('ArrowLeft', true))
		// Switching windows and back focuses the field again
		source.focus(search)
		expect(search.marks).toEqual([true, true])
	})

	it('treats leaving a field by keyboard as keyboard navigation', () => {
		const source = createFocusSource()
		const next = field()
		source.pointerdown()
		source.keydown(key('Escape', true))
		source.focus(next)
		expect(next.marks).toEqual([false])
	})

	it('treats keys on other controls as keyboard navigation', () => {
		const source = createFocusSource()
		const next = field()
		source.pointerdown()
		source.keydown(key('ArrowDown'))
		source.focus(next)
		expect(next.marks).toEqual([false])
	})

	it('ignores shortcuts, unless a keyboard command focuses a field', () => {
		const source = createFocusSource()
		const search = field()
		source.pointerdown()
		source.keydown(key('f', false, { metaKey: true }))
		source.focus(search)
		source.keyboard()
		source.focus(search)
		expect(search.marks).toEqual([true, false])
	})
})
