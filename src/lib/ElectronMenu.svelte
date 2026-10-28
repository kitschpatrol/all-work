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

	// The main process rebuilds the whole menu for each update, so send only changes
	let sent = ''
	$effect(() => {
		const next = JSON.stringify(state)
		if (next === sent) {
			return
		}

		sent = next
		globalThis._allWork?.updateMenuState(state)
	})
</script>
