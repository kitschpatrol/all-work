import type { Attachment } from 'svelte/attachments'
import { on } from 'svelte/events'

/**
 * Set a table cell's or header's `title` as the pointer enters it, instead of
 * rendering a title for every cell. Hovers then describe values as they are
 * when hovered, and updates never rebuild titles nobody reads.
 *
 * @param describe Text for a `td` or `th` carrying `data-column-id`.
 */
export function titleOnHover(describe: (cell: HTMLElement) => string): Attachment<HTMLElement> {
	return (container) =>
		on(container, 'pointerover', (event) => {
			const cell =
				event.target instanceof Element
					? (event.target.closest<HTMLElement>('td[data-column-id], th[data-column-id]') ??
						undefined)
					: undefined
			if (cell === undefined || !container.contains(cell)) {
				return
			}

			const title = describe(cell)
			if (cell.title !== title) {
				cell.title = title
			}
		})
}
