<script lang="ts">
	import type { Repository } from './workspace.js'
	import FolderIcon from './FolderIcon.svelte'
	import GithubIcon from './GithubIcon.svelte'
	import { getGithubUrl } from './repository-links.js'
	import { vscodeUrl } from './table-formatting.js'
	const {
		onOpen,
		repository,
		tooltip,
	}: {
		onOpen: (repository: Repository, app: 'finder' | 'terminal' | 'tower') => Promise<void>
		repository: Repository
		tooltip: string
	} = $props()
	const githubUrl = $derived(getGithubUrl(repository.remote))
</script>

<div class="repository-heading">
	<div class="repository-name" title={`${tooltip}\n${repository.path}`}>
		<FolderIcon /><strong>{repository.relativePath}</strong>
	</div>
	{#if repository.error !== undefined}<span
			class="metadata-error"
			aria-label="Metadata incomplete"
			title={repository.error}>!</span
		>{/if}
	<div class="repository-actions">
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
			aria-label="Open {repository.name} in Finder"
			onclick={async () => onOpen(repository, 'finder')}
			title="Open in Finder"
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
			aria-label="Open {repository.name} in default terminal"
			onclick={async () => onOpen(repository, 'terminal')}
			title="Open in default terminal"
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
	</div>
</div>
