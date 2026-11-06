/**
 * Escape does one thing per press, innermost first. A completion list or an
 * inline preset save claims the press in its own handler. Then a search field
 * with text clears, then an open popover closes, and last the layout blurs the
 * focused control so shortcuts apply to the table again. A stage that acts
 * calls `preventDefault`, and later stages leave a handled press alone. The
 * popovers listen on the document and the layout on the window, so the stages
 * run in that order however the components mount.
 */

/** The parts of a key press the Escape stages read. */
export type EscapePress = Pick<
	KeyboardEvent,
	'defaultPrevented' | 'isComposing' | 'key' | 'preventDefault'
>

/** Whether a key press is an Escape that no earlier stage has handled. */
export function isUnhandledEscape(event: EscapePress): boolean {
	return event.key === 'Escape' && !event.isComposing && !event.defaultPrevented
}

/**
 * Clear a search field's text on Escape, in place of the browser's own
 * clearing, so the press stops here instead of also closing the popover around
 * the field.
 */
export function clearSearchOnEscape(
	event: EscapePress & { currentTarget: Pick<HTMLInputElement, 'dispatchEvent' | 'value'> },
): void {
	const field = event.currentTarget
	if (!isUnhandledEscape(event) || field.value === '') {
		return
	}

	event.preventDefault()
	field.value = ''
	field.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Close an open popover on Escape, once nothing inside it has claimed the
 * press.
 */
export function closeOnEscape(event: EscapePress, popover: { open: boolean }): void {
	if (!isUnhandledEscape(event) || !popover.open) {
		return
	}

	event.preventDefault()
	popover.open = false
}
