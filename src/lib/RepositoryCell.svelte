<script lang="ts">
	import type { NativeOpenTarget } from './repository-links.js'
	import type { Repository } from './workspace.js'
	import FolderIcon from './FolderIcon.svelte'
	import GithubIcon from './GithubIcon.svelte'
	import { getGithubUrl, openRepositoryLink } from './repository-links.js'
	import { metadataActivity, vscodeUrl } from './table-formatting.js'
	const {
		onOpen,
		onRefresh,
		repository,
		showShortcuts,
		tooltip,
	}: {
		onOpen: (repository: Repository, app: NativeOpenTarget) => Promise<void>
		onRefresh: (repository: Repository) => Promise<void>
		repository: Repository
		showShortcuts: boolean
		tooltip: string
	} = $props()
	const githubUrl = $derived(getGithubUrl(repository.remote))
	const activity = $derived(metadataActivity(repository))
	let menuError = $state('')

	async function showMenu(event: MouseEvent) {
		if (globalThis._allWork === undefined) {
			return
		}

		event.preventDefault()
		menuError = ''
		try {
			const choice = await globalThis._allWork.showRepositoryMenu({
				hasGithubRemote: githubUrl !== undefined,
				hasReadme: repository.readme !== '',
			})
			switch (choice) {
				case 'copyPath': {
					await navigator.clipboard.writeText(repository.path)
					break
				}

				case 'finder':
				case 'readme':
				case 'terminal':
				case 'tower': {
					await onOpen(repository, choice)
					break
				}

				case 'github':
				case 'vscode': {
					openRepositoryLink(repository, choice)
					break
				}

				case 'refresh': {
					await onRefresh(repository)
					break
				}

				case undefined: {
					break
				}
			}
		} catch (error) {
			menuError = error instanceof Error ? error.message : String(error)
		}
	}
</script>

<div
	class="repository-heading"
	aria-label="{repository.name} actions"
	oncontextmenu={showMenu}
	role="group"
>
	<div class="repository-name" title={`${tooltip}\n${repository.path}`}>
		<FolderIcon /><strong>{repository.relativePath}</strong>
	</div>
	{#if menuError !== ''}<span class="metadata-error" role="alert" title={menuError}>!</span>{/if}
	{#if repository.error !== undefined}<span
			class="metadata-error"
			aria-label="Metadata incomplete"
			title={repository.error}>!</span
		>{/if}
	{#if showShortcuts}<div class="repository-actions">
			<button
				class="repository-action"
				aria-label={repository.readme === ''
					? `No readme in ${repository.name}`
					: `Open ${repository.readme} for ${repository.name}`}
				disabled={repository.readme === ''}
				onclick={async () => onOpen(repository, 'readme')}
				title={repository.readme === '' ? 'No readme' : `Open ${repository.readme}`}
				type="button"
			>
				<svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16"
					><path
						d="M3.5 2.5a1 1 0 0 1 1-1h5l3 3v9a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-11Z"
						stroke="currentColor"
						stroke-linejoin="round"
					/><path
						d="M9.5 1.5v3h3M5.5 7.5h5M5.5 9.5h5M5.5 11.5h3"
						stroke="currentColor"
						stroke-linejoin="round"
					/></svg
				>
			</button>
			<button
				class="repository-action"
				aria-label="Open {repository.name} in Tower"
				onclick={async () => onOpen(repository, 'tower')}
				title="Open in Tower"
				type="button"
			>
				<svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16"
					><path
						d="M3.5 1.5h2v2h2v-2h1v2h2v-2h2v4l-1 1v7h-7v-7l-1-1v-4Z"
						stroke="currentColor"
						stroke-linejoin="round"
					/><path d="M7 13.5v-3h2v3M6.5 7.5h3" stroke="currentColor" /></svg
				>
			</button>
			<a
				class="repository-action"
				aria-label="Open {repository.name} in VS Code"
				href={vscodeUrl(repository.path)}
				rel="external"
				title="Open in VS Code"
			>
				<svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16"
					><path
						d="m11 1.5 3 1.3v10.4l-3 1.3-7-5.2-2 1.5-1-1V6.2l1-1 2 1.5 7-5.2Z"
						stroke="currentColor"
						stroke-linejoin="round"
					/><path d="M11 1.5v13M4 6.7 11 12M4 9.3 11 4" stroke="currentColor" /></svg
				>
			</a>
			{#if githubUrl !== undefined}
				<a
					class="repository-action"
					aria-label="Open {repository.name} in GitHub"
					href={githubUrl}
					rel="external noopener noreferrer"
					target="_blank"
					title="Open in GitHub"><GithubIcon /></a
				>
			{:else}
				<button
					class="repository-action"
					aria-label="No GitHub origin remote for {repository.name}"
					disabled
					title="No GitHub origin remote"
					type="button"><GithubIcon /></button
				>
			{/if}
			<button
				class="repository-action"
				aria-label="Reveal {repository.name} in Finder"
				onclick={async () => onOpen(repository, 'finder')}
				title="Reveal in Finder"
				type="button"
			>
				<svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16"
					><path
						d="M1.5 4a1 1 0 0 1 1-1H6l1.5 2h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4Z"
						stroke="currentColor"
						stroke-linejoin="round"
					/></svg
				>
			</button>
			<button
				class="repository-action"
				aria-label="Open {repository.name} in terminal"
				onclick={async () => onOpen(repository, 'terminal')}
				title="Open in terminal"
				type="button"
			>
				<svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16"
					><rect height="11" rx="1" stroke="currentColor" width="13" x="1.5" y="2.5" /><path
						d="m4 6 2 2-2 2m4 0h3"
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
					/></svg
				>
			</button>
			<button
				class="repository-action"
				class:queued={activity === 'queued'}
				class:refreshing={activity === 'loading'}
				aria-label="Refresh metadata for {repository.name}"
				onclick={async () => onRefresh(repository)}
				title={activity === 'loading'
					? 'Loading metadata…'
					: activity === 'queued'
						? 'Waiting to load metadata…'
						: 'Refresh metadata'}
				type="button"
			>
				<svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16"
					><path
						d="M13.5 8A5.5 5.5 0 1 1 11.89 4.11"
						stroke="currentColor"
						stroke-linecap="round"
					/><path
						d="M12.5 1.5v3h-3"
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
					/></svg
				>
			</button>
		</div>{/if}
</div>
