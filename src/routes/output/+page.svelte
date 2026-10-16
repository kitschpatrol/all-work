<script lang="ts">
	import { page } from '$app/state'
	import OutputPanel from '#lib/OutputPanel.svelte'
	import { listenForWindowMessages } from '#lib/window-messages.js'
	import { onMount } from 'svelte'

	const runId = $derived(page.url.searchParams.get('run') ?? '')

	onMount(() =>
		listenForWindowMessages((message) => {
			if (message.type === 'run-removed' && message.runId === runId) {
				globalThis.close()
			}
		}),
	)
</script>

<div class="output-window">
	<OutputPanel
		name={page.url.searchParams.get('name') ?? ''}
		path={page.url.searchParams.get('path') ?? ''}
		repositoryId={page.url.searchParams.get('repository') ?? ''}
		{runId}
	/>
</div>
