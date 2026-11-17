<script lang="ts">
	import type { RepositoryShortcuts } from './preferences.js'
	import type { NativeOpenTarget } from './repository-links.js'
	import type { CommandRun, Repository } from './workspace.js'
	import {
		formatColumnCellValue,
		getColumnDisplay,
		getColumnLinkedItems,
		getColumnUrl,
		getColumnValue,
		getMetadataPlaceholder,
	} from './column-variables.js'
	import OutputPreview from './OutputPreview.svelte'
	import RepositoryCell from './RepositoryCell.svelte'
	import { formatDate, splitBreakableWords } from './table-formatting.js'

	const {
		columnId,
		onError,
		onInspect,
		onOpen,
		onRefresh,
		onStop,
		outputLines,
		repository,
		runs,
		shortcuts,
	}: {
		columnId: string
		onError: (error: unknown) => void
		onInspect: (run: CommandRun, repository: Repository) => void
		onOpen: (repository: Repository, app: NativeOpenTarget) => Promise<void>
		onRefresh: (repository: Repository) => Promise<void>
		onStop: (run: CommandRun, repository: Repository) => Promise<void>
		outputLines: number
		repository: Repository
		runs: CommandRun[]
		shortcuts: RepositoryShortcuts
	} = $props()
	const run = $derived(runs.find((item) => item.id === columnId))
	const result = $derived(run?.results[repository.id])
	const display = $derived(getColumnDisplay(columnId))
	const value = $derived(formatColumnCellValue(repository, columnId, runs))
	const raw = $derived(getColumnValue(repository, columnId, runs))
	const missing = $derived(raw === undefined || raw === '')
	const url = $derived(getColumnUrl(repository, columnId))
	const linkLabel = $derived(
		['metadata:Forked From', 'metadata:Template From'].includes(columnId) &&
			url?.hostname === 'github.com'
			? url.pathname.slice(1)
			: value,
	)
	const linkedItems = $derived(getColumnLinkedItems(repository, columnId))
	const words = $derived(splitBreakableWords(value))
	// Preserve the space that Svelte trims from literal text at block boundaries.
	const listSeparator = ', '

	async function openLink(event: MouseEvent, target = url) {
		if (
			target === undefined ||
			globalThis._allWork === undefined ||
			(event.button !== 0 && event.button !== 1)
		) {
			return
		}

		event.preventDefault()
		try {
			await globalThis._allWork.openExternalUrl(target.href)
		} catch (error) {
			onError(error)
		}
	}
</script>

{#snippet placeholder(text: string)}<span class="cell-placeholder">{text}</span>{/snippet}

{#snippet linkedText(text: string, className: string)}
	{#if url !== undefined}<a
			class="{className} cell-link"
			href={url.href}
			onauxclick={openLink}
			onclick={openLink}
			rel="external noopener noreferrer"
			target="_blank">{text}</a
		>{:else}<span class={className}>{text}</span>{/if}
{/snippet}

{#if columnId === 'relativePath'}<RepositoryCell {onOpen} {onRefresh} {repository} {shortcuts} />
{:else if columnId === 'name'}{@render linkedText(repository.name, 'project-name')}
{:else if columnId === 'branch'}{#if repository.branch === ''}<span class="branch"
			>⑂ {@render placeholder(getMetadataPlaceholder(repository, 'branch'))}</span
		>{:else}{@render linkedText(`⑂ ${repository.branch}`, 'branch')}{/if}
{:else if columnId === 'changedFiles'}<span
		class="status-badge"
		class:dirty={repository.changedFiles > 0}
		><span class="status-dot"></span><span class="status-label"
			>{#if repository.gitStatusAvailable}{repository.changedFiles > 0
					? `${repository.changedFiles} Changed`
					: 'Clean'}{:else}{@render placeholder(
					getMetadataPlaceholder(repository, 'changedFiles'),
				)}{/if}</span
		></span
	>
{:else if columnId === 'sync'}{#if repository.ahead > 0 || repository.behind > 0}{@render linkedText(
			`↑${repository.ahead} ↓${repository.behind}`,
			'sync-value',
		)}{:else}<span class="sync-value">{@render placeholder('—')}</span>{/if}
{:else if columnId === 'lastCommitDate'}{#if repository.lastCommitDate === '' && repository.metadata?.groups.git?.status !== 'ready'}<span
			class="date-value"
			>{@render placeholder(getMetadataPlaceholder(repository, 'lastCommitDate'))}</span
		>{:else}{@render linkedText(formatDate(repository.lastCommitDate), 'date-value')}{/if}
{:else if run !== undefined}{#if result !== undefined}<OutputPreview
			label="View output for {repository.name}"
			lineLimit={outputLines}
			onInspect={() => {
				onInspect(run, repository)
			}}
			onStop={async () => onStop(run, repository)}
			{result}
			stopLabel="Stop the command in {repository.name}"
		/>{:else}<span class="not-targeted">Not included in this run</span>{/if}
{:else if linkedItems !== undefined && linkedItems.length > 0}<span class="cell-text"
		>{#each linkedItems as item, index (index)}{#if index > 0}{listSeparator}{/if}{#if item.url !== undefined}<a
					class="cell-link cell-word"
					href={item.url.href}
					onauxclick={async (event) => openLink(event, item.url)}
					onclick={async (event) => openLink(event, item.url)}
					rel="external noopener noreferrer"
					target="_blank">{item.label}</a
				>{:else}<span class="cell-word">{item.label}</span>{/if}{/each}</span
	>
{:else if url !== undefined}<a
		class="cell-text cell-link"
		class:monospace={display !== 'text'}
		href={url.href}
		onauxclick={openLink}
		onclick={openLink}
		rel="external noopener noreferrer"
		target="_blank">{linkLabel}</a
	>
{:else}<span class="cell-text" class:monospace={display !== 'text'}
		>{#if missing}{@render placeholder(
				value,
			)}{:else}{#each words as word, index (index)}{#if index % 2 === 1}<span class="cell-word"
						>{word}</span
					>{:else}{word}{/if}{/each}{/if}</span
	>{/if}
