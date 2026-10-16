<script lang="ts">
	import { onMount } from 'svelte'
	import type { Preferences } from './preferences.js'
	import type { SavedView } from './view-storage.js'
	import { defaultPreferences } from './preferences.js'
	import { createViewWriter, loadLocalState, parseSavedView } from './view-storage.js'

	const {
		defaultDirectory,
		onError,
		onRestore,
		snapshot,
	}: {
		defaultDirectory: string
		onError: (message: string) => void
		onRestore: (view: SavedView, preferences: Preferences) => Promise<void>
		snapshot: SavedView
	} = $props()
	let writer: ReturnType<typeof createViewWriter> | undefined
	let ready = $state(false)

	function flush() {
		try {
			writer?.flush()
		} catch {
			onError('View settings could not be saved to local storage.')
		}
	}

	/** Clear the saved layout before restoring the current view's defaults. */
	export function reset() {
		writer?.reset()
	}

	onMount(() => {
		void (async () => {
			let saved: ReturnType<typeof loadLocalState>
			try {
				writer = createViewWriter(localStorage, () =>
					onError('View settings could not be saved to local storage.'),
				)
				saved = loadLocalState(localStorage, defaultDirectory)
			} catch {
				saved = {
					preferences: defaultPreferences(),
					view: parseSavedView(undefined, defaultDirectory),
				}
			}

			try {
				await onRestore(saved.view, saved.preferences)
			} catch (error) {
				onError(error instanceof Error ? error.message : 'Saved settings could not be restored.')
			} finally {
				ready = true
			}
		})()

		return flush
	})

	$effect(() => {
		if (ready) {
			writer?.queue(snapshot)
		}
	})
</script>

<svelte:window onpagehide={flush} />
