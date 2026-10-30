<script lang="ts">
	import { onMount } from 'svelte'
	import { on } from 'svelte/events'
	import type { OutputNeighbors, OutputTarget } from './app-windows.js'
	import type { CommandRun, StreamEvent } from './workspace.js'

	/**
	 * Live output for one repository in one run, shared by the Electron output
	 * window and the in-page dialog. Subscribes to the run's event stream on its
	 * own; the main page only supplies the neighboring results to step to.
	 */
	const {
		name,
		neighbors,
		onClose,
		onNavigate,
		path,
		relativePath,
		repositoryId,
		runId,
	}: {
		name: string
		neighbors: OutputNeighbors
		onClose?: () => void
		onNavigate: (target: OutputTarget) => void
		path: string
		relativePath: string
		repositoryId: string
		runId: string
	} = $props()
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
		return () => {
			stream.close()
		}
	})

	function step(target: OutputTarget | undefined) {
		if (target !== undefined) {
			onNavigate(target)
		}
	}

	async function copyOutput() {
		try {
			await navigator.clipboard.writeText(result?.output ?? '')
		} catch {
			message = 'Could not copy output to the clipboard.'
		}
	}
</script>

<svelte:head>
	<title>{run === undefined ? relativePath : `Run ${run.number}: ${relativePath}`}</title>
</svelte:head>

<div class="output-panel">
	<div class="window-heading">
		{#if onClose !== undefined}<button
				class="remove-button dialog-close-button"
				aria-label="Close output"
				onclick={onClose}
				type="button">×</button
			>{/if}
		<div>
			<span class="eyebrow">{name}</span>
			<h2><code>$ {result?.command ?? run?.command ?? ''}</code></h2>
			<p>{path}</p>
		</div>
	</div>
	<div class="window-toolbar">
		<span
			>{result?.status ?? 'loading'}{result?.exitCode === undefined
				? ''
				: ` · exit ${result.exitCode}`}</span
		>
		<div class="window-toolbar-actions">
			<button
				class="button subtle"
				disabled={neighbors.previous === undefined}
				onclick={() => {
					step(neighbors.previous)
				}}
				title={neighbors.previous?.name}
				type="button">Previous result</button
			>
			<button
				class="button subtle"
				disabled={neighbors.next === undefined}
				onclick={() => {
					step(neighbors.next)
				}}
				title={neighbors.next?.name}
				type="button">Next result</button
			>
			<button
				class="button subtle"
				disabled={result === undefined}
				onclick={copyOutput}
				type="button">Copy output</button
			>
		</div>
	</div>
	{#if message !== ''}<div class="message error" role="alert"><span>{message}</span></div>{/if}
	<!-- Stepping to another result starts its output at the top -->
	{#key repositoryId}<pre class="full-output">{result === undefined || result.output === ''
				? 'No output yet.'
				: result.output}{result?.truncated === true
				? '\n\n[Output truncated at 128,000 characters. The command continues to run.]'
				: ''}</pre>{/key}
</div>
