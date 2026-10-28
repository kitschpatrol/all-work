<script lang="ts">
	import type { OutputNeighbors, OutputTarget } from '#lib/app-windows.js'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { outputWindowUrl } from '#lib/app-windows.js'
	import OutputPanel from '#lib/OutputPanel.svelte'
	import { listenForWindowMessages, postWindowMessage } from '#lib/window-messages.js'
	import { onMount } from 'svelte'

	const runId = $derived(page.url.searchParams.get('run') ?? '')
	const repositoryId = $derived(page.url.searchParams.get('repository') ?? '')
	let neighbors = $state<OutputNeighbors>({ next: undefined, previous: undefined })

	/** Ask the main window which results sit beside this one in its table now. */
	function requestNeighbors() {
		postWindowMessage({ repositoryId, runId, type: 'output-neighbors-request' })
	}

	async function navigate(target: OutputTarget) {
		neighbors = { next: undefined, previous: undefined }
		await goto(outputWindowUrl(target), { replace: true, reset: false })
		requestNeighbors()
	}

	onMount(() => {
		requestNeighbors()
		return listenForWindowMessages((message) => {
			if (message.type === 'run-removed' && message.runId === runId) {
				globalThis.close()
			} else if (
				message.type === 'output-neighbors' &&
				message.runId === runId &&
				message.repositoryId === repositoryId
			) {
				neighbors = { next: message.next, previous: message.previous }
			}
		})
	})
</script>

<svelte:window onfocus={requestNeighbors} />

<div class="output-window">
	<OutputPanel
		name={page.url.searchParams.get('name') ?? ''}
		{neighbors}
		onNavigate={navigate}
		path={page.url.searchParams.get('path') ?? ''}
		{repositoryId}
		{runId}
	/>
</div>
