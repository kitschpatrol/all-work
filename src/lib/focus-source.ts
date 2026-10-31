// Keys that leave a text field or move focus, unlike typing and moving the caret
const fieldExitKeys = new Set(['Enter', 'Escape', 'Tab'])

/**
 * Track whether the pointer or the keyboard last moved focus, as AppKit does to
 * decide focus rings: a control the pointer focused shows none, while one the
 * keyboard reached does. Each element is marked as it gains focus, so typing in
 * a field a click focused never rings it.
 *
 * @returns Handlers for presses, key presses, and focus changes, and a way to
 *   treat the next focus change as the keyboard's.
 */
export function createFocusSource() {
	type KeyPress = Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey'> & {
		/** Whether the key went to a field that takes typing. */
		editing: boolean
	}

	let pointer = false
	return {
		/**
		 * Mark an element gaining focus with `data-pointer-focus` when the pointer
		 * moved focus.
		 */
		focus(target: Pick<Element, 'toggleAttribute'>) {
			target.toggleAttribute('data-pointer-focus', pointer)
		},
		/**
		 * Treat the next focus change as the keyboard's, for a keyboard command
		 * such as Command-F.
		 */
		keyboard() {
			pointer = false
		},
		/** Treat key presses as keyboard navigation, except typing and shortcuts. */
		keydown(event: KeyPress) {
			if (event.altKey || event.ctrlKey || event.metaKey) {
				return
			}

			if (!event.editing || fieldExitKeys.has(event.key)) {
				pointer = false
			}
		},
		pointerdown() {
			pointer = true
		},
	}
}

/** Where focus came from in this window. */
export const focusSource = createFocusSource()

/**
 * Focus and select a field for a keyboard command such as Command-F, ringing it
 * as keyboard navigation would.
 *
 * @param field The field, if it is rendered.
 */
export function focusFromKeyboard(field: HTMLInputElement | undefined) {
	focusSource.keyboard()
	field?.focus()
	field?.select()
}
