<script lang="ts">
	import type { Preferences } from '#lib/preferences.js'
	import PreferencesPanel from '#lib/PreferencesPanel.svelte'
	import { postWindowMessage } from '#lib/window-messages.js'
</script>

<svelte:head>
	<title>All Work Preferences</title>
</svelte:head>

<div class="preferences-window">
	<PreferencesPanel
		onClose={() => globalThis.close()}
		onReset={(clearHistory: boolean) => {
			postWindowMessage({ clearHistory, type: 'reset-view' })
		}}
		onSaved={(preferences: Preferences) => {
			postWindowMessage({ preferences, type: 'preferences-changed' })
		}}
	/>
</div>
