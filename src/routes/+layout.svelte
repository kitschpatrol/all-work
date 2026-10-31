<script lang="ts">
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
</script>

<svelte:window
	onfocusincapture={focusin}
	onkeydowncapture={keydown}
	onpointerdowncapture={() => {
		focusSource.pointerdown()
	}}
/>

{@render children()}
