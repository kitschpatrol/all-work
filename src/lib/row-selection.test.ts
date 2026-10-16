import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRowSelection, rangeIds, withChecked } from './row-selection.js'

type Handler = (event: unknown) => void

class FakeInput {
	checked = true
}

const ids = ['a', 'b', 'c', 'd', 'e']

function setup(initial: Record<string, true> = {}, visible = ids) {
	let selection = initial
	const controller = createRowSelection({
		ids: () => visible,
		onChange(next) {
			selection = next
		},
		scroller() {
			throw new Error('Scrolling is only used while dragging')
		},
		selection: () => selection,
	})
	const rows = new Map<string, Map<string, Handler>>()
	for (const id of ids) {
		const handlers = new Map<string, Handler>()
		controller.checkbox(id)({
			addEventListener(type: string, handler: Handler) {
				handlers.set(type, handler)
			},
			querySelector: vi.fn<() => undefined>(),
			removeEventListener: vi.fn<() => void>(),
		} as unknown as HTMLElement)
		rows.set(id, handlers)
	}

	function dispatch(id: string, type: string, event: Record<string, unknown>) {
		const preventDefault = vi.fn<() => void>()
		rows.get(id)?.get(type)?.({ button: 0, preventDefault, ...event })
		return preventDefault
	}

	return {
		checked: () => Object.keys(selection).toSorted(),
		click: (id: string, modifiers: { ctrlKey?: boolean; shiftKey?: boolean } = {}) =>
			dispatch(id, 'pointerdown', { clientX: 0, clientY: 0, ...modifiers }),
		controller,
		dispatch,
	}
}

beforeEach(() => {
	vi.stubGlobal('navigator', { userAgent: 'Macintosh' })
	vi.stubGlobal('requestAnimationFrame', () => 0)
	vi.stubGlobal('cancelAnimationFrame', vi.fn<() => void>())
	vi.stubGlobal('addEventListener', vi.fn<() => void>())
	vi.stubGlobal('removeEventListener', vi.fn<() => void>())
	vi.stubGlobal('HTMLInputElement', FakeInput)
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('rangeIds', () => {
	it('lists a range in display order in either direction', () => {
		expect(rangeIds(ids, 'b', 'd')).toEqual(['b', 'c', 'd'])
		expect(rangeIds(ids, 'd', 'b')).toEqual(['b', 'c', 'd'])
		expect(rangeIds(ids, 'c', 'c')).toEqual(['c'])
	})

	it('is empty when an end is not displayed', () => {
		expect(rangeIds(ids, 'hidden', 'b')).toEqual([])
		expect(rangeIds(ids, 'b', 'hidden')).toEqual([])
	})
})

describe('withChecked', () => {
	it('checks and unchecks ids while keeping the rest', () => {
		expect(withChecked({ a: true, z: true }, ['b', 'c'], true)).toEqual({
			a: true,
			b: true,
			c: true,
			z: true,
		})
		expect(withChecked({ a: true, b: true, z: true }, ['b', 'c'], false)).toEqual({
			a: true,
			z: true,
		})
	})
})

describe('row checkbox selection', () => {
	it('toggles a single row on click, without Command changing that', () => {
		const table = setup()
		table.click('b')
		table.click('d', { ctrlKey: false })
		expect(table.checked()).toEqual(['b', 'd'])
		table.click('b')
		expect(table.checked()).toEqual(['d'])
	})

	it('extends from the anchor on Shift-click and resizes the range on the next one', () => {
		const table = setup({ e: true })
		table.click('a')
		table.click('d', { shiftKey: true })
		expect(table.checked()).toEqual(['a', 'b', 'c', 'd', 'e'])
		table.click('b', { shiftKey: true })
		expect(table.checked()).toEqual(['a', 'b', 'e'])
	})

	it('applies the anchor state, so a range can be unchecked', () => {
		const table = setup({ a: true, b: true, c: true, d: true, e: true })
		table.click('b')
		table.click('d', { shiftKey: true })
		expect(table.checked()).toEqual(['a', 'e'])
	})

	it('toggles one row on Shift-click when there is no visible anchor', () => {
		const table = setup()
		table.click('c', { shiftKey: true })
		expect(table.checked()).toEqual(['c'])

		const filtered = setup({}, ['a', 'b'])
		filtered.click('d')
		filtered.click('b', { shiftKey: true })
		expect(filtered.checked()).toEqual(['b', 'd'])
	})

	it('keeps changes made between Shift-clicks instead of reverting them', () => {
		const table = setup()
		table.click('a')
		table.click('b', { shiftKey: true })
		table.controller.set(['e'], true)
		table.click('c', { shiftKey: true })
		expect(table.checked()).toEqual(['a', 'b', 'c', 'e'])
	})

	it('forgets the anchor after selecting or clearing everything', () => {
		const table = setup()
		table.click('a')
		table.controller.setAll(true)
		table.click('c', { shiftKey: true })
		expect(table.checked()).toEqual(['a', 'b', 'd', 'e'])
		table.controller.clear()
		table.click('e', { shiftKey: true })
		expect(table.checked()).toEqual(['e'])
	})

	it('selects and clears only the visible rows from Select All, but Deselect All clears hidden rows', () => {
		const table = setup({ hidden: true }, ['a', 'b'])
		table.controller.setAll(true)
		expect(table.checked()).toEqual(['a', 'b', 'hidden'])
		table.controller.setAll(false)
		expect(table.checked()).toEqual(['hidden'])
		table.controller.clear()
		expect(table.checked()).toEqual([])
	})

	it('ignores Control-click on macOS, where it opens a context menu', () => {
		const table = setup()
		const preventDefault = table.click('a', { ctrlKey: true })
		expect(table.checked()).toEqual([])
		expect(preventDefault).not.toHaveBeenCalled()
	})

	it('handles pointer clicks itself but lets keyboard activation toggle natively', () => {
		const table = setup()
		expect(table.dispatch('a', 'click', { detail: 1 })).toHaveBeenCalledOnce()
		expect(table.dispatch('a', 'click', { detail: 0 })).not.toHaveBeenCalled()
		table.dispatch('b', 'change', { target: new FakeInput() })
		table.click('d', { shiftKey: true })
		expect(table.checked()).toEqual(['b', 'c', 'd'])
	})
})
