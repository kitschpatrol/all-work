import { describe, expect, it } from 'vitest'
import { clearSearchOnEscape, closeOnEscape, isUnhandledEscape } from './escape-key.js'

function press(overrides: { isComposing?: boolean; key?: string } = {}) {
	let handled = false
	return {
		get defaultPrevented() {
			return handled
		},
		isComposing: false,
		key: 'Escape',
		preventDefault() {
			handled = true
		},
		...overrides,
	}
}

function searchField(value: string) {
	const events: string[] = []
	return {
		events,
		field: {
			dispatchEvent(event: Event) {
				events.push(event.type)
				return true
			},
			value,
		},
	}
}

describe('isUnhandledEscape', () => {
	it('accepts an Escape no earlier stage handled', () => {
		expect(isUnhandledEscape(press())).toBe(true)
	})

	it('ignores other keys, composition, and handled presses', () => {
		expect(isUnhandledEscape(press({ key: 'Enter' }))).toBe(false)
		expect(isUnhandledEscape(press({ isComposing: true }))).toBe(false)
		const handled = press()
		handled.preventDefault()
		expect(isUnhandledEscape(handled)).toBe(false)
	})
})

describe('clearSearchOnEscape', () => {
	it('clears the text, reports the change, and claims the press', () => {
		const { events, field } = searchField('git')
		const event = Object.assign(press(), { currentTarget: field })
		clearSearchOnEscape(event)
		expect(field.value).toBe('')
		expect(events).toEqual(['input'])
		expect(event.defaultPrevented).toBe(true)
	})

	it('passes the press on when the field is empty', () => {
		const { events, field } = searchField('')
		const event = Object.assign(press(), { currentTarget: field })
		clearSearchOnEscape(event)
		expect(events).toEqual([])
		expect(event.defaultPrevented).toBe(false)
	})

	it('leaves the text when an earlier stage handled the press', () => {
		const { field } = searchField('git')
		const event = Object.assign(press(), { currentTarget: field })
		event.preventDefault()
		clearSearchOnEscape(event)
		expect(field.value).toBe('git')
	})

	it('ignores other keys', () => {
		const { events, field } = searchField('git')
		clearSearchOnEscape(Object.assign(press({ key: 'Backspace' }), { currentTarget: field }))
		expect(field.value).toBe('git')
		expect(events).toEqual([])
	})
})

describe('closeOnEscape', () => {
	it('closes an open popover and claims the press', () => {
		const popover = { open: true }
		const event = press()
		closeOnEscape(event, popover)
		expect(popover.open).toBe(false)
		expect(event.defaultPrevented).toBe(true)
	})

	it('passes the press on when the popover is already closed', () => {
		const popover = { open: false }
		const event = press()
		closeOnEscape(event, popover)
		expect(event.defaultPrevented).toBe(false)
	})

	it('stays open when a field inside it cleared on the same press', () => {
		const popover = { open: true }
		const event = press()
		event.preventDefault()
		closeOnEscape(event, popover)
		expect(popover.open).toBe(true)
	})
})
