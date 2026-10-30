<script lang="ts">
	import type { RepositoryShortcuts } from './preferences.js'
	import type { NativeOpenTarget } from './repository-links.js'
	import type { CommandRun, Repository } from './workspace.js'
	import {
		formatColumnCellValue,
		getColumnDisplay,
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

{#if columnId === 'relativePath'}<RepositoryCell {onOpen} {onRefresh} {repository} {shortcuts} />
{:else if columnId === 'name'}<span class="project-name">{repository.name}</span>
{:else if columnId === 'branch'}<span class="branch"
		>⑂ {repository.branch === ''
			? getMetadataPlaceholder(repository, 'branch')
			: repository.branch}</span
	>
{:else if columnId === 'changedFiles'}<span
		class="status-badge"
		class:dirty={repository.changedFiles > 0}
		><span class="status-dot"></span><span class="status-label"
			>{repository.gitStatusAvailable
				? repository.changedFiles > 0
					? `${repository.changedFiles} Changed`
					: 'Clean'
				: getMetadataPlaceholder(repository, 'changedFiles')}</span
		></span
	>
{:else if columnId === 'sync'}<span class="sync-value"
		>{repository.ahead > 0 || repository.behind > 0
			? `↑${repository.ahead} ↓${repository.behind}`
			: '—'}</span
	>
{:else if columnId === 'lastCommitDate'}<span class="date-value"
		>{repository.lastCommitDate === '' && repository.metadata?.groups.git?.status !== 'ready'
			? getMetadataPlaceholder(repository, 'lastCommitDate')
			: formatDate(repository.lastCommitDate)}</span
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
{:else}<span class="cell-text" class:monospace={display !== 'text'}>{value}</span>{/if}
