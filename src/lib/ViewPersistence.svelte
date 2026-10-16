<script lang="ts">
	import { onMount } from 'svelte'
	import type { Preferences } from './preferences.js'
	import type { SavedView } from './view-storage.js'
	import { defaultPreferences } from './preferences.js'
	import { createViewWriter, loadSettings, parseSavedView } from './view-storage.js'

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
		void writer?.flush(true)
	}

	/** Clear the saved layout before restoring the current view's defaults. */
	export async function reset() {
		await writer?.reset()
		ready = true
	}

	onMount(() => {
		void (async () => {
			let saved: Awaited<ReturnType<typeof loadSettings>>
			let loaded = false
			try {
				writer = createViewWriter(() => onError('View settings could not be saved to disk.'))
				saved = await loadSettings(defaultDirectory)
				loaded = true
			} catch {
				onError('Saved settings could not be loaded from disk.')
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
				ready = loaded
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
