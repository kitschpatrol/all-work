<script lang="ts">
	import type { CommandRun } from './workspace.js'
	import { wrapRowText } from './row-text-lines.js'

	/**
	 * A run's output for one repository in its table cell, with buttons to open
	 * the full output and, while the command runs, to stop it.
	 */
	const {
		label,
		lineLimit,
		onInspect,
		onStop,
		result,
		stopLabel,
	}: {
		label: string
		lineLimit: number
		onInspect: () => void
		onStop: () => Promise<void>
		result: CommandRun['results'][string]
		stopLabel: string
	} = $props()
	let clipped = $state(false)
	const output = $derived(
		result.output === ''
			? result.status === 'queued'
				? 'Waiting for a slot…'
				: result.status === 'running'
					? 'Running…'
					: 'No output'
			: result.output,
	)

	function observeClipping(element: HTMLPreElement, _output: string) {
		let frame = 0
		function measure() {
			cancelAnimationFrame(frame)
			frame = requestAnimationFrame(() => {
				clipped = element.scrollHeight > element.clientHeight + 1
			})
		}

		const observer = new ResizeObserver(measure)
		observer.observe(element)
		measure()
		return {
			destroy() {
				observer.disconnect()
				cancelAnimationFrame(frame)
			},
			update: measure,
		}
	}
</script>

<div class="output-preview" {@attach wrapRowText}>
	<div
		class="result-meta"
		class:failed={result.status === 'failed'}
		class:success={result.status === 'success'}
	>
		<span class="status-dot"></span>{result.status}{result.exitCode === undefined
			? ''
			: ` · exit ${result.exitCode}`}<span class="result-duration"
			>{result.duration === undefined ? '' : `${(result.duration / 1000).toFixed(1)}s`}</span
		>{#if result.status === 'running'}<button
				class="stop-button output-action"
				aria-label={stopLabel}
				onclick={onStop}
				title={stopLabel}
				type="button">■</button
			>{/if}<button
			class="repository-action output-action"
			aria-label={label}
			onclick={onInspect}
			title={result.truncated
				? 'Output capture limit reached. Open the captured output.'
				: clipped
					? 'Preview shortened. Open the full output.'
					: 'Open the output'}
			type="button"
			><svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16"
				><rect height="11" rx="1.5" stroke="currentColor" width="13" x="1.5" y="2.5" /><path
					d="M1.5 5.5h13"
					stroke="currentColor"
				/><path
					d="M3.5 4h.01M5 4h.01M6.5 4h.01"
					stroke="currentColor"
					stroke-linecap="round"
				/></svg
			></button
		>
	</div>
	<pre
		style:max-height="{lineLimit * 14}px"
		use:observeClipping={output}>{output}{#if clipped || result.truncated}<span
				class="output-more"
				aria-hidden="true">…</span
			>{/if}</pre>
</div>
