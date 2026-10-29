import type { Attachment } from 'svelte/attachments'

const callbacks = new WeakMap<Element, (inView: boolean) => void>()
let observer: IntersectionObserver | undefined

/**
 * Report whether an element is on screen, including clipping by the scrolling
 * table around it. Every element shares one observer.
 *
 * @param callback Receives `true` as the element scrolls into view and `false`
 *   as it leaves.
 */
export function inView(callback: (inView: boolean) => void): Attachment {
	return (element) => {
		observer ??= new IntersectionObserver((entries) => {
			for (const entry of entries) {
				callbacks.get(entry.target)?.(entry.isIntersecting)
			}
		})
		callbacks.set(element, callback)
		observer.observe(element)
		return () => {
			observer?.unobserve(element)
			callbacks.delete(element)
		}
	}
}
