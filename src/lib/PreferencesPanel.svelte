<script lang="ts">
	import { onMount } from 'svelte'
	import type { Preferences } from './preferences.js'
	import { request } from './client-request.js'
	import { defaultPreferences, parseIdentity, parseIdentityNames } from './preferences.js'
	import { loadSettings, savePreferences } from './view-storage.js'

	/**
	 * The preferences form, shared by the Electron preferences window and the
	 * in-page dialog. Saves through the settings API and reports changes to the
	 * host, which decides how to reach the main page.
	 */
	const {
		onClose,
		onReset,
		onSaved,
	}: {
		onClose: () => void
		onReset: (clearHistory: boolean) => void
		onSaved: (preferences: Preferences) => void
	} = $props()
	let preferences = $state(defaultPreferences())
	let authorNames = $state('')
	let githubAccounts = $state('')
	let restoreWorkspace = $state(true)
	let busy = $state(true)
	let message = $state('')

	function readDraft() {
		authorNames = preferences.identity.authorNames.join('\n')
		githubAccounts = preferences.identity.githubAccounts.join('\n')
		restoreWorkspace = preferences.restoreWorkspace
	}

	onMount(() => {
		void (async () => {
			try {
				const settings = await loadSettings('')
				preferences = settings.preferences
				readDraft()
			} catch {
				message = 'Saved preferences could not be loaded from disk.'
			} finally {
				busy = false
			}
		})()
	})

	async function action(callback: () => Promise<void> | void, success: string) {
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

	async function persist(next: Preferences) {
		preferences = next
		await savePreferences(next)
		onSaved($state.snapshot(next))
	}

	async function save() {
		const identity = parseIdentity({
			authorNames: parseIdentityNames(authorNames),
			githubAccounts: parseIdentityNames(githubAccounts),
		})
		if (identity === undefined) {
			throw new Error('Use at most 100 author names and accounts, each under 200 characters.')
		}

		await persist({ identity, restoreWorkspace, version: 1 })
		onClose()
	}

	async function resetAll() {
		await persist(defaultPreferences())
		onReset(true)
	}
</script>

<form
	class="preferences-panel"
	onsubmit={(event) => {
		event.preventDefault()
		void action(save, '')
	}}
>
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
				Preferences and view settings are saved as JSON files in AllWork’s application data folder.
				Metadata and command output are cached separately.
			</p>
			<div class="preference-reset">
				<button
					class="button subtle"
					onclick={async () =>
						action(() => {
							onReset(false)
						}, 'View reset.')}
					type="button">Reset View</button
				><span>Restore toolbar and table defaults. Keep identity and command output.</span>
			</div>
			<div class="preference-reset">
				<button
					class="button subtle"
					onclick={async () =>
						action(async () => {
							await request('/api/cache', {}, 'DELETE')
						}, 'Metadata cache cleared.')}
					type="button">Clear Metadata Cache</button
				><span>Rebuild metadata on the next refresh or reload.</span>
			</div>
			<div class="preference-reset">
				<button
					class="button subtle"
					onclick={async () => action(resetAll, 'All settings reset.')}
					type="button">Reset All Settings</button
				><span>Reset identity, view settings and command history.</span>
			</div>
		</fieldset>
		<p class="preference-message" aria-live="polite">{message}</p>
	</div>
	<div class="preferences-actions">
		<button class="button subtle" disabled={busy} onclick={onClose} type="button">Cancel</button
		><button class="button primary" disabled={busy} type="submit">Save</button>
	</div>
</form>
