<script lang="ts">
	import { isUnhandledEscape } from '#lib/escape-key.js'
	import { focusSource } from '#lib/focus-source.js'
	import type { LayoutProps } from './$types'
	import '../app.css'

	let { children }: LayoutProps = $props()

	function keydown(event: KeyboardEvent) {
		focusSource.keydown({
			altKey: event.altKey,
			ctrlKey: event.ctrlKey,
			editing: event.target instanceof Element && event.target.matches(':read-write'),
			key: event.key,
			metaKey: event.metaKey,
		})
	}

	function focusin(event: FocusEvent) {
		if (event.target instanceof Element) {
			focusSource.focus(event.target)
		}
	}

	// The last Escape stage, on the window so the popovers' document handlers run first
	function blurOnEscape(event: KeyboardEvent) {
		if (isUnhandledEscape(event) && event.target instanceof HTMLElement) {
			event.target.blur()
		}
	}
</script>

<svelte:window
	onfocusincapture={focusin}
	onkeydown={blurOnEscape}
	onkeydowncapture={keydown}
	onpointerdowncapture={() => {
		focusSource.pointerdown()
	}}
/>

{@render children()}
