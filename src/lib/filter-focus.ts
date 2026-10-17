import { tick } from 'svelte'

/** Reveal the appended condition and focus its value or comparison control. */
export async function focusLastFilterRule(): Promise<void> {
	await tick()
	const bar = document.querySelector<HTMLElement>('.filter-bar')
	const row = bar?.querySelector(':scope > .filter-row:last-of-type')
	const input =
		row?.querySelector<HTMLInputElement>('input') ??
		row?.querySelector<HTMLSelectElement>('select[aria-label="Status"]') ??
		row?.querySelector<HTMLSelectElement>('.filter-operator')
	if (bar !== null) {
		bar.scrollTop = bar.scrollHeight
	}

	input?.focus({ preventScroll: true })
}
