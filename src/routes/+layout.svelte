<script lang="ts">
	import type { LayoutProps } from './$types'
	import '../app.css'

	let { children }: LayoutProps = $props()

	// Focus rings follow AppKit: a control a pointer focused shows none, one the keyboard reached does
	function markPointerFocus() {
		document.documentElement.dataset.pointerFocus = ''
	}

	function markKeyboardFocus(event: KeyboardEvent) {
		if (event.key === 'Tab' || (!event.altKey && !event.ctrlKey && !event.metaKey)) {
			delete document.documentElement.dataset.pointerFocus
		}
	}
</script>

<svelte:window onkeydowncapture={markKeyboardFocus} onpointerdowncapture={markPointerFocus} />

{@render children()}
