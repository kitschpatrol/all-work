<script lang="ts">
	import type { CommandRun, Repository } from './workspace.js'
	const {
		onClose,
		onError,
		repository,
		result,
		run,
	}: {
		onClose: () => void
		onError: (message: string) => void
		repository: Repository | undefined
		result: CommandRun['results'][string] | undefined
		run: CommandRun | undefined
	} = $props()
	let dialog: HTMLDialogElement

	/** Open the selected output in its detail window. */
	export function show() {
		dialog.showModal()
	}
	/** Close the detail window when its output column is removed. */
	export function close() {
		dialog.close()
	}
</script>

<dialog bind:this={dialog} class="output-dialog" onclose={onClose}>
	<div class="dialog-heading">
		<button
			class="remove-button dialog-close-button"
			aria-label="Close output"
			onclick={close}
			type="button">×</button
		>
		<div>
			<span class="eyebrow">{repository?.name}</span>
			<h2><code>$ {run?.command}</code></h2>
			<p>{repository?.path}</p>
		</div>
	</div>
	<div class="dialog-toolbar">
		<span>{result?.status}{result?.exitCode === undefined ? '' : ` · exit ${result.exitCode}`}</span
		>
		<button
			class="button subtle"
			onclick={async () => {
				try {
					await navigator.clipboard.writeText(result?.output ?? '')
				} catch {
					onError('Could not copy output to the clipboard.')
				}
			}}
			type="button">Copy output</button
		>
	</div>
	<pre class="full-output">{result?.output === ''
			? 'No output yet.'
			: (result?.output ?? 'No output yet.')}{result?.truncated === true
			? '\n\n[Output truncated at 128,000 characters. The command continues to run.]'
			: ''}</pre>
</dialog>
