<script lang="ts">
	import type { CommandRun } from './workspace.js'
	import { wrapRowText } from './row-text-lines.js'

	const {
		label,
		lineLimit,
		onInspect,
		result,
	}: {
		label: string
		lineLimit: number
		onInspect: () => void
		result: CommandRun['results'][string]
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

<button
	class="output-preview"
	{@attach wrapRowText}
	aria-label={label}
	onclick={(event) => {
		if (event.detail === 0 || globalThis.getSelection()?.isCollapsed !== false) {
			onInspect()
		}
	}}
	title={result.truncated
		? 'Output capture limit reached. Click to view captured output.'
		: clipped
			? 'Preview shortened. Click to view full output.'
			: 'View output'}
	type="button"
>
	<span
		class="result-meta"
		class:failed={result.status === 'failed'}
		class:success={result.status === 'success'}
	>
		<span class="status-dot"></span>{result.status}{result.exitCode === undefined
			? ''
			: ` · exit ${result.exitCode}`}<span class="result-duration"
			>{result.duration === undefined ? '' : `${(result.duration / 1000).toFixed(1)}s`} ↗</span
		>
	</span>
	<pre
		style:max-height="{lineLimit * 14}px"
		use:observeClipping={output}>{output}{#if clipped || result.truncated}<span
				class="output-more"
				aria-hidden="true">…</span
			>{/if}</pre>
</button>
