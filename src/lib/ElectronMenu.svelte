<script lang="ts">
	import { onMount } from 'svelte'
	import type { MenuActions, MenuState } from './electron-api.js'

	/**
	 * Bridges the Electron application menu to the page: runs the handler for
	 * each menu command and keeps menu items enabled and checked to match the
	 * current state. Renders nothing, and does nothing in a browser.
	 */
	const { actions, state }: { actions: MenuActions; state: MenuState } = $props()

	onMount(() =>
		globalThis._allWork?.onMenuCommand((command, payload) => {
			if (Object.hasOwn(actions, command)) {
				actions[command](payload)
			}
		}),
	)

	$effect(() => {
		globalThis._allWork?.updateMenuState(state)
	})
</script>
