<script lang="ts">
	import { onMount } from 'svelte'
	import type { AppChoices, Preferences } from './preferences.js'
	import { request } from './client-request.js'
	import { defaultPreferences, parseIdentity, parseIdentityNames } from './preferences.js'
	import { loadSettings, savePreferences } from './view-storage.js'
	import { listenForWindowMessages } from './window-messages.js'

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
	let readmeApp = $state('')
	let readmeApps: AppChoices = $state({ apps: [], defaultName: '' })
	let restoreWorkspace = $state(true)
	let showRepositoryShortcuts = $state(false)
	let terminalApp = $state('')
	let terminalApps: AppChoices = $state({ apps: [], defaultName: '' })
	let busy = $state(true)
	let message = $state('')
	// Keep a saved choice selectable after its app is uninstalled or the list fails to load
	const readmeAppOptions = $derived(
		readmeApp === '' || readmeApps.apps.some((app) => app.id === readmeApp)
			? readmeApps.apps
			: [...readmeApps.apps, { id: readmeApp, name: readmeApp }],
	)
	const terminalAppOptions = $derived(
		terminalApp === '' || terminalApps.apps.some((app) => app.id === terminalApp)
			? terminalApps.apps
			: [...terminalApps.apps, { id: terminalApp, name: terminalApp }],
	)

	function readDraft() {
		authorNames = preferences.identity.authorNames.join('\n')
		githubAccounts = preferences.identity.githubAccounts.join('\n')
		readmeApp = preferences.readmeApp
		restoreWorkspace = preferences.restoreWorkspace
		showRepositoryShortcuts = preferences.showRepositoryShortcuts
		terminalApp = preferences.terminalApp
	}

	onMount(() => {
		const stopMessages = listenForWindowMessages((update) => {
			if (update.type !== 'preferences-changed') {
				return
			}

			preferences = update.preferences
			showRepositoryShortcuts = update.preferences.showRepositoryShortcuts
		})
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

		void (async () => {
			try {
				;[readmeApps, terminalApps] = await Promise.all([
					request<AppChoices>('/api/readme-apps', {}),
					request<AppChoices>('/api/terminal-apps', {}),
				])
			} catch (error) {
				message = error instanceof Error ? error.message : 'Applications could not be listed.'
			}
		})()

		return stopMessages
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

		await persist({
			...preferences,
			identity,
			readmeApp,
			restoreWorkspace,
			showRepositoryShortcuts,
			terminalApp,
			version: 1,
		})
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
			<legend>Appearance</legend>
			<label class="preference-checkbox"
				><input type="checkbox" bind:checked={showRepositoryShortcuts} /> Show repo shortcut buttons</label
			>
		</fieldset>
		<fieldset disabled={busy}>
			<legend>Readmes</legend>
			<div class="preference-field">
				<label for="preference-readme-app">Open with</label><select
					id="preference-readme-app"
					bind:value={readmeApp}
				>
					<option value=""
						>{readmeApps.defaultName === ''
							? 'System default'
							: `System default (${readmeApps.defaultName})`}</option
					>
					{#each readmeAppOptions as app (app.id)}<option value={app.id}>{app.name}</option>{/each}
				</select>
			</div>
			<p class="preference-help">
				Used by the readme shortcut button. Lists the applications macOS offers for Markdown files.
			</p>
		</fieldset>
		<fieldset disabled={busy}>
			<legend>Terminal</legend>
			<div class="preference-field">
				<label for="preference-terminal-app">Open with</label><select
					id="preference-terminal-app"
					bind:value={terminalApp}
				>
					<option value=""
						>{terminalApps.defaultName === ''
							? 'System default'
							: `System default (${terminalApps.defaultName})`}</option
					>
					{#each terminalAppOptions as app (app.id)}<option value={app.id}>{app.name}</option
						>{/each}
				</select>
			</div>
			<p class="preference-help">
				Used by the terminal shortcut button and Open Selected In › Terminal. The system default is
				the app macOS uses for shell scripts.
			</p>
		</fieldset>
		<fieldset disabled={busy}>
			<legend>Storage</legend>
			<label class="preference-checkbox"
				><input type="checkbox" bind:checked={restoreWorkspace} /> Restore the last workspace on launch</label
			>
			<p class="preference-help">
				Preferences and view settings are saved as JSON files in All Work’s application data folder.
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
