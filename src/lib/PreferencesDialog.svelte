<script lang="ts">
	import type { Preferences } from './preferences.js'
	import { parseIdentityNames } from './preferences.js'

	const {
		onClearCache,
		onResetAll,
		onResetView,
		onSave,
		preferences,
	}: {
		onClearCache: () => Promise<void>
		onResetAll: () => Promise<void>
		onResetView: () => Promise<void>
		onSave: (preferences: Preferences) => Promise<void>
		preferences: Preferences
	} = $props()
	let dialog: HTMLDialogElement
	let authorNames = $state('')
	let githubAccounts = $state('')
	let restoreWorkspace = $state(true)
	let busy = $state(false)
	let message = $state('')

	function readDraft() {
		authorNames = preferences.identity.authorNames.join('\n')
		githubAccounts = preferences.identity.githubAccounts.join('\n')
		restoreWorkspace = preferences.restoreWorkspace
	}

	/** Open the preferences dialog with a fresh draft of the saved preferences. */
	export function show() {
		readDraft()
		message = ''
		dialog.showModal()
	}

	async function action(callback: () => Promise<void>, success: string) {
		busy = true
		message = ''
		try {
			await callback()
			readDraft()
			message = success
		} catch (error) {
			message = error instanceof Error ? error.message : 'The action failed.'
		} finally {
			busy = false
		}
	}
</script>

<svelte:window
	onkeydown={(event: KeyboardEvent) => {
		// Electron's application menu owns this shortcut
		if (
			globalThis._allwork !== undefined ||
			(!event.metaKey && !event.ctrlKey) ||
			event.key !== ','
		) {
			return
		}

		event.preventDefault()
		show()
	}}
/>

<button
	class="button subtle preferences-button"
	onclick={show}
	title="Preferences… (⌘,)"
	type="button">Preferences…</button
>
<dialog bind:this={dialog} class="preferences-dialog">
	<form
		onsubmit={(event) => {
			event.preventDefault()
			void action(async () => {
				await onSave({
					identity: {
						authorNames: parseIdentityNames(authorNames),
						githubAccounts: parseIdentityNames(githubAccounts),
					},
					restoreWorkspace,
					version: 1,
				})
				dialog.close()
			}, '')
		}}
	>
		<div class="dialog-heading">
			<button
				class="remove-button dialog-close-button"
				aria-label="Close preferences"
				onclick={() => dialog.close()}
				type="button">×</button
			>
			<h2>Preferences</h2>
		</div>
		<div class="preferences-content">
			<fieldset disabled={busy}>
				<legend>Identity</legend>
				<div class="preference-field">
					<label for="preference-authors">Author names</label><textarea
						id="preference-authors"
						rows="3"
						bind:value={authorNames}
					></textarea>
				</div>
				<div class="preference-field">
					<label for="preference-accounts">GitHub accounts</label><textarea
						id="preference-accounts"
						rows="3"
						bind:value={githubAccounts}
					></textarea>
				</div>
				<p class="preference-help">
					One name or account per line. Used by Metascope to identify your authored and maintained
					projects.
				</p>
			</fieldset>
			<fieldset disabled={busy}>
				<legend>Storage</legend>
				<label class="preference-checkbox"
					><input type="checkbox" bind:checked={restoreWorkspace} /> Restore the last workspace on launch</label
				>
				<p class="preference-help">
					Preferences and view settings are saved as JSON files in AllWork’s application data
					folder. Metadata and command output are cached separately.
				</p>
				<div class="preference-reset">
					<button
						class="button subtle"
						onclick={async () => action(onResetView, 'View reset.')}
						type="button">Reset View</button
					><span>Restore toolbar and table defaults. Keep identity and command output.</span>
				</div>
				<div class="preference-reset">
					<button
						class="button subtle"
						onclick={async () => action(onClearCache, 'Metadata cache cleared.')}
						type="button">Clear Metadata Cache</button
					><span>Rebuild metadata on the next refresh or reload.</span>
				</div>
				<div class="preference-reset">
					<button
						class="button subtle"
						onclick={async () => action(onResetAll, 'All settings reset.')}
						type="button">Reset All Settings</button
					><span>Reset identity, view settings and command history.</span>
				</div>
			</fieldset>
			<p class="preference-message" aria-live="polite">{message}</p>
		</div>
		<div class="preferences-actions">
			<button class="button subtle" disabled={busy} onclick={() => dialog.close()} type="button"
				>Cancel</button
			><button class="button primary" disabled={busy} type="submit">Save</button>
		</div>
	</form>
</dialog>
