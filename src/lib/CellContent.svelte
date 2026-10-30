<script lang="ts">
	import type { RepositoryShortcuts } from './preferences.js'
	import type { NativeOpenTarget } from './repository-links.js'
	import type { CommandRun, Repository } from './workspace.js'
	import {
		formatColumnCellValue,
		getColumnDisplay,
		getColumnValue,
		getMetadataPlaceholder,
	} from './column-variables.js'
	import { parseExternalUrl } from './external-links.js'
	import OutputPreview from './OutputPreview.svelte'
	import RepositoryCell from './RepositoryCell.svelte'
	import { formatDate } from './table-formatting.js'

	const {
		columnId,
		onError,
		onInspect,
		onOpen,
		onRefresh,
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
	const url = $derived(parseExternalUrl(value))

	async function openLink(event: MouseEvent) {
		if (
			url === undefined ||
			globalThis._allWork === undefined ||
			(event.button !== 0 && event.button !== 1)
		) {
			return
		}

		event.preventDefault()
		try {
			await globalThis._allWork.openExternalUrl(url.href)
		} catch (error) {
			onError(error)
		}
	}
</script>

{#snippet placeholder(text: string)}<span class="cell-placeholder">{text}</span>{/snippet}

{#if columnId === 'relativePath'}<RepositoryCell {onOpen} {onRefresh} {repository} {shortcuts} />
{:else if columnId === 'name'}<span class="project-name">{repository.name}</span>
{:else if columnId === 'branch'}<span class="branch"
		>⑂ {#if repository.branch === ''}{@render placeholder(
				getMetadataPlaceholder(repository, 'branch'),
			)}{:else}{repository.branch}{/if}</span
	>
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
{:else if columnId === 'sync'}<span class="sync-value"
		>{#if repository.ahead > 0 || repository.behind > 0}↑{repository.ahead} ↓{repository.behind}{:else}{@render placeholder(
				'—',
			)}{/if}</span
	>
{:else if columnId === 'lastCommitDate'}<span class="date-value"
		>{#if repository.lastCommitDate === '' && repository.metadata?.groups.git?.status !== 'ready'}{@render placeholder(
				getMetadataPlaceholder(repository, 'lastCommitDate'),
			)}{:else}{formatDate(repository.lastCommitDate)}{/if}</span
	>
{:else if run !== undefined}{#if result !== undefined}<OutputPreview
			label="View output for {repository.name}"
			lineLimit={outputLines}
			onInspect={() => {
				onInspect(run, repository)
			}}
			{result}
		/>{:else}<span class="not-targeted">Not included in this run</span>{/if}
{:else if url !== undefined}<a
		class="cell-text cell-link"
		href={url.href}
		onauxclick={openLink}
		onclick={openLink}
		rel="external noopener noreferrer"
		target="_blank">{value}</a
	>
{:else}<span class="cell-text" class:monospace={display !== 'text'}
		>{#if missing}{@render placeholder(value)}{:else}{value}{/if}</span
	>{/if}
