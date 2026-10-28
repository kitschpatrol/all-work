import type { Attachment } from 'svelte/attachments'

/** Checked row ids. Unchecked rows are absent. */
type Selection = Record<string, true>

type RowSelectionOptions = {
	/** Visible row ids in display order. */
	ids: () => string[]
	onChange: (selection: Selection) => void
	/**
	 * The scrolling element holding the table, whose rows carry
	 * `data-repository-id`.
	 */
	scroller: () => HTMLElement
	selection: () => Selection
}

const dragThreshold = 4
const edgeZone = 8
const maxScrollStep = 16

/**
 * List the ids from `from` through `to` inclusive, in display order. Returns an
 * empty list when either id is not displayed.
 */
export function rangeIds(order: string[], from: string, to: string): string[] {
	const start = order.indexOf(from)
	const end = order.indexOf(to)
	return start === -1 || end === -1
		? []
		: order.slice(Math.min(start, end), Math.max(start, end) + 1)
}

/** Copy `selection` with every id in `ids` checked or unchecked. */
export function withChecked(selection: Selection, ids: string[], checked: boolean): Selection {
	const changed = new Set(ids)
	const kept = Object.keys(selection).filter((id) => !changed.has(id))
	return Object.fromEntries(
		[...kept, ...(checked ? changed : [])].map((id): [string, true] => [id, true]),
	)
}

function sameSelection(first: Selection, second: Selection) {
	const ids = Object.keys(first)
	return ids.length === Object.keys(second).length && ids.every((id) => Object.hasOwn(second, id))
}

function isMac() {
	// eslint-disable-next-line node/no-unsupported-features/node-builtins -- Runs in the browser, not Node
	return navigator.userAgent.includes('Mac')
}

function isTextField(target: unknown) {
	return target instanceof Element && target.matches(':read-write')
}

/**
 * Row checkboxes that select like a Finder list. A click toggles one row and
 * becomes the anchor. Shift-click applies the anchor's state from the anchor to
 * the clicked row, and later Shift-clicks resize that range, returning rows
 * outside it to their earlier state. Dragging down the checkbox column does the
 * same live, scrolling at the edges. Command-A selects every visible row unless
 * a text field has focus.
 */
export function createRowSelection(options: RowSelectionOptions) {
	// A Shift-click or drag range in progress, measured from the last plain click
	type Extension = { anchor: string; base: Selection; checked: boolean; result: Selection }
	let extension: Extension | undefined

	function emit(next: Selection) {
		options.onChange(next)
		if (extension !== undefined) {
			extension.result = next
		}
	}

	function toggle(id: string, checked: boolean) {
		const next = withChecked(options.selection(), [id], checked)
		extension = { anchor: id, base: next, checked, result: next }
		emit(next)
	}

	function extendTo(target: string): boolean {
		if (extension === undefined) {
			return false
		}

		const range = rangeIds(options.ids(), extension.anchor, target)
		if (range.length === 0) {
			return false
		}

		// The selection changed some other way since the range began, so build on what's there now
		if (!sameSelection(options.selection(), extension.result)) {
			extension.base = options.selection()
		}

		emit(withChecked(extension.base, range, extension.checked))
		return true
	}

	function track(start: PointerEvent, id: string) {
		const x = start.clientX
		let y = start.clientY
		let last = id
		let dragging = false
		let frame = requestAnimationFrame(update)

		function update() {
			frame = requestAnimationFrame(update)
			if (!dragging) {
				return
			}

			const scroller = options.scroller()
			const bounds = scroller.getBoundingClientRect()
			const top = scroller.querySelector('thead')?.getBoundingClientRect().bottom ?? bounds.top
			// The client box excludes the scroller's border, where no row can be found
			const bottom = bounds.top + scroller.clientTop + scroller.clientHeight
			const beyond = Math.min(y - top - edgeZone, 0) + Math.max(y - bottom + edgeZone, 0)
			scroller.scrollTop += Math.sign(beyond) * Math.min(maxScrollStep, Math.abs(beyond) / 3)
			const row = document
				.elementFromPoint(x, Math.min(Math.max(y, top + 1), bottom - 1))
				?.closest<HTMLElement>('[data-repository-id]')?.dataset.repositoryId
			if (row === undefined || row === last) {
				return
			}

			last = row
			extendTo(row)
		}

		function move(event: PointerEvent) {
			y = event.clientY
			dragging ||= Math.abs(y - start.clientY) > dragThreshold
		}

		function stop() {
			cancelAnimationFrame(frame)
			removeEventListener('pointermove', move)
			removeEventListener('pointerup', stop)
			removeEventListener('pointercancel', stop)
		}

		addEventListener('pointermove', move)
		addEventListener('pointerup', stop)
		addEventListener('pointercancel', stop)
	}

	/** Check or uncheck every visible row. */
	function setAll(checked: boolean) {
		extension = undefined
		options.onChange(withChecked(options.selection(), options.ids(), checked))
	}

	/** Uncheck every row, including rows hidden by filters. */
	function clear() {
		extension = undefined
		options.onChange({})
	}

	/**
	 * Edit › Select All: a focused text field selects its text, otherwise every
	 * visible row.
	 */
	function selectAll() {
		const active = document.activeElement
		if (
			isTextField(active) &&
			(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
		) {
			active.select()
		} else {
			setAll(true)
		}
	}

	/**
	 * Command-A and Option-Command-A for the browser build, which has no menu
	 * bar.
	 */
	function shortcut(event: KeyboardEvent) {
		if (
			!(isMac() ? event.metaKey : event.ctrlKey) ||
			event.shiftKey ||
			event.code !== 'KeyA' ||
			isTextField(event.target)
		) {
			return
		}

		event.preventDefault()
		if (event.altKey) {
			clear()
		} else {
			setAll(true)
		}
	}

	/** Check or uncheck specific rows without moving the anchor. */
	function set(ids: string[], checked: boolean) {
		options.onChange(withChecked(options.selection(), ids, checked))
	}

	/** Wire the element wrapping a row's checkbox, so the whole cell responds. */
	function checkbox(id: string): Attachment<HTMLElement> {
		return (element) => {
			const listeners = new AbortController()
			const { signal } = listeners
			element.addEventListener(
				'pointerdown',
				(event) => {
					// Control-click opens a context menu on macOS
					if (event.button !== 0 || (isMac() && event.ctrlKey)) {
						return
					}

					event.preventDefault()
					element.querySelector('input')?.focus({ preventScroll: true })
					if (event.shiftKey && extendTo(id)) {
						return
					}

					toggle(id, !Object.hasOwn(options.selection(), id))
					track(event, id)
				},
				{ signal },
			)
			// Pointer presses toggle above; keyboard and assistive clicks (detail 0) stay native
			element.addEventListener(
				'click',
				(event) => {
					if (event.detail > 0) {
						event.preventDefault()
					}
				},
				{ signal },
			)
			element.addEventListener(
				'change',
				(event) => {
					if (event.target instanceof HTMLInputElement) {
						toggle(id, event.target.checked)
					}
				},
				{ signal },
			)
			return () => {
				listeners.abort()
			}
		}
	}

	return { checkbox, clear, selectAll, set, setAll, shortcut }
}
