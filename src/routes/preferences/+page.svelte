<script lang="ts">
	import { request } from '#lib/client-request.js'
	import { defaultPreferences, parseIdentity, parseIdentityNames } from '#lib/preferences.js'
	import { loadSettings, savePreferences } from '#lib/view-storage.js'
	import { postWindowMessage } from '#lib/window-messages.js'
	import { onMount } from 'svelte'

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

	async function save() {
		const identity = parseIdentity({
			authorNames: parseIdentityNames(authorNames),
			githubAccounts: parseIdentityNames(githubAccounts),
		})
		if (identity === undefined) {
			throw new Error('Use at most 100 author names and accounts, each under 200 characters.')
		}

		preferences = { identity, restoreWorkspace, version: 1 }
		await savePreferences(preferences)
		postWindowMessage({ preferences: $state.snapshot(preferences), type: 'preferences-changed' })
	}

	async function resetAll() {
		preferences = defaultPreferences()
		await savePreferences(preferences)
		postWindowMessage({ preferences: $state.snapshot(preferences), type: 'preferences-changed' })
		postWindowMessage({ clearHistory: true, type: 'reset-view' })
	}
</script>

<svelte:head>
	<title>AllWork Preferences</title>
</svelte:head>

<form
	class="preferences-window"
	onsubmit={(event) => {
		event.preventDefault()
		void action(async () => {
			await save()
			globalThis.close()
		}, '')
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
							postWindowMessage({ clearHistory: false, type: 'reset-view' })
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
		<button class="button subtle" disabled={busy} onclick={() => globalThis.close()} type="button"
			>Cancel</button
		><button class="button primary" disabled={busy} type="submit">Save</button>
	</div>
</form>
