<script lang="ts">
	import { onMount } from 'svelte'
	import type { AppWindow, OutputTarget } from './app-windows.js'
	import type { Preferences } from './preferences.js'
	import type { CommandRun, Repository } from './workspace.js'
	import { getOutputNeighbors, openElectronWindow } from './app-windows.js'
	import OutputPanel from './OutputPanel.svelte'
	import PreferencesPanel from './PreferencesPanel.svelte'
	import { listenForWindowMessages, postWindowMessage } from './window-messages.js'

	/**
	 * Opens preferences and run output: as native windows in the Electron app,
	 * where the application menu provides the shortcuts, or as dialogs over the
	 * page in a browser. Tells output windows and dialogs which results sit
	 * beside theirs in the table, so they can step between them.
	 */
	const {
		isElectron,
		onError,
		onPreferences,
		onResetView,
		rows,
		runs,
	}: {
		isElectron: boolean
		onError: (error: unknown) => void
		onPreferences: (preferences: Preferences) => void
		onResetView: (clearHistory: boolean) => void
		/** The table's rows in display order, for stepping between results. */
		rows: readonly Repository[]
		runs: readonly CommandRun[]
	} = $props()
	let preferencesDialog = $state<HTMLDialogElement>()
	let outputDialog = $state<HTMLDialogElement>()
	let preferencesOpen = $state(false)
	let output = $state<Extract<AppWindow, { kind: 'output' }>>()

	function getNeighbors(target: { repositoryId: string; runId: string }) {
		return getOutputNeighbors(
			rows,
			runs.find((run) => run.id === target.runId),
			target.repositoryId,
		)
	}

	onMount(() =>
		listenForWindowMessages((message) => {
			if (message.type === 'output-neighbors-request') {
				postWindowMessage({ ...message, ...getNeighbors(message), type: 'output-neighbors' })
			}
		}),
	)

	/**
	 * Open the target, bringing an existing Electron window forward instead of
	 * duplicating it.
	 *
	 * @param target The window to show.
	 */
	export async function open(target: AppWindow) {
		if (isElectron) {
			try {
				await openElectronWindow(target)
			} catch (error) {
				onError(error)
			}
		} else if (target.kind === 'preferences') {
			preferencesOpen = true
			preferencesDialog?.showModal()
		} else {
			output = target
			outputDialog?.showModal()
		}
	}

	/**
	 * Close the in-page output dialog when its run is deleted. Electron windows
	 * listen for the broadcast themselves.
	 *
	 * @param runId The deleted run.
	 */
	export function closeOutput(runId: string) {
		if (output?.runId === runId) {
			outputDialog?.close()
		}
	}
</script>

<svelte:window
	onkeydown={(event: KeyboardEvent) => {
		if (isElectron || (!event.metaKey && !event.ctrlKey) || event.key !== ',') {
			return
		}

		event.preventDefault()
		void open({ kind: 'preferences' })
	}}
/>

{#if !isElectron}
	<dialog
		bind:this={preferencesDialog}
		class="preferences-dialog"
		onclose={() => {
			preferencesOpen = false
		}}
	>
		{#if preferencesOpen}<PreferencesPanel
				onClose={() => preferencesDialog?.close()}
				onReset={onResetView}
				onSaved={onPreferences}
			/>{/if}
	</dialog>
	<dialog
		bind:this={outputDialog}
		class="output-dialog"
		onclose={() => {
			output = undefined
		}}
	>
		{#if output !== undefined}<OutputPanel
				name={output.name}
				neighbors={getNeighbors(output)}
				onClose={() => outputDialog?.close()}
				onNavigate={(target: OutputTarget) => {
					output = { kind: 'output', ...target }
				}}
				path={output.path}
				repositoryId={output.repositoryId}
				runId={output.runId}
			/>{/if}
	</dialog>
{/if}
