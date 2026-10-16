<script lang="ts">
	import type { CommandRun, StreamEvent } from '#lib/workspace.js'
	import { page } from '$app/state'
	import { listenForWindowMessages } from '#lib/window-messages.js'
	import { onMount } from 'svelte'
	import { on } from 'svelte/events'

	const runId = $derived(page.url.searchParams.get('run') ?? '')
	const repositoryId = $derived(page.url.searchParams.get('repository') ?? '')
	const name = $derived(page.url.searchParams.get('name') ?? '')
	const path = $derived(page.url.searchParams.get('path') ?? '')
	let run = $state<CommandRun>()
	let message = $state('')
	const result = $derived(run?.results[repositoryId])

	onMount(() => {
		// eslint-disable-next-line node/no-unsupported-features/node-builtins -- This EventSource runs in the browser.
		const stream = new EventSource(`/api/runs/events?ids=${encodeURIComponent(runId)}`)
		on(stream, 'message', (event) => {
			if (!(event instanceof MessageEvent)) {
				return
			}

			const update = JSON.parse(String(event.data)) as StreamEvent
			if (update.type === 'snapshot') {
				run = update.run
			} else if (run !== undefined && update.type === 'result') {
				run.results[update.result.repositoryId] = update.result
			} else if (run !== undefined) {
				run.finished = true
				stream.close()
			}
		})
		on(stream, 'error', () => {
			if (stream.readyState !== 2) {
				return
			}

			message =
				run === undefined
					? 'This output is no longer available. The run was deleted or the server restarted.'
					: 'Lost the command stream. Output shown here may be incomplete.'
		})
		const stopMessages = listenForWindowMessages((update) => {
			if (update.type === 'run-removed' && update.runId === runId) {
				globalThis.close()
			}
		})
		return () => {
			stream.close()
			stopMessages()
		}
	})

	async function copyOutput() {
		try {
			await navigator.clipboard.writeText(result?.output ?? '')
		} catch {
			message = 'Could not copy output to the clipboard.'
		}
	}
</script>

<svelte:head>
	<title>{name}{run === undefined ? '' : ` — $ ${run.command}`}</title>
</svelte:head>

<div class="output-window">
	<div class="window-heading">
		<div>
			<span class="eyebrow">{name}</span>
			<h2><code>$ {run?.command ?? ''}</code></h2>
			<p>{path}</p>
		</div>
	</div>
	<div class="window-toolbar">
		<span
			>{result?.status ?? 'loading'}{result?.exitCode === undefined
				? ''
				: ` · exit ${result.exitCode}`}</span
		>
		<button class="button subtle" disabled={result === undefined} onclick={copyOutput} type="button"
			>Copy output</button
		>
	</div>
	{#if message !== ''}<div class="message error" role="alert"><span>{message}</span></div>{/if}
	<pre class="full-output">{result?.output === '' || result === undefined
			? 'No output yet.'
			: result.output}{result?.truncated === true
			? '\n\n[Output truncated at 128,000 characters. The command continues to run.]'
			: ''}</pre>
</div>
