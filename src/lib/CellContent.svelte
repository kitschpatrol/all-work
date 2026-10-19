<script lang="ts">
	import type { NativeOpenTarget } from './repository-links.js'
	import type { CommandRun, Repository } from './workspace.js'
	import {
		formatColumnCellValue,
		getColumnDisplay,
		getMetadataPlaceholder,
	} from './column-variables.js'
	import OutputPreview from './OutputPreview.svelte'
	import RepositoryCell from './RepositoryCell.svelte'
	import { formatDate } from './table-formatting.js'

	const {
		columnId,
		onInspect,
		onOpen,
		onRefresh,
		outputLines,
		repository,
		runs,
		showShortcuts,
		tooltip,
	}: {
		columnId: string
		onInspect: (run: CommandRun, repository: Repository) => void
		onOpen: (repository: Repository, app: NativeOpenTarget) => Promise<void>
		onRefresh: (repository: Repository) => Promise<void>
		outputLines: number
		repository: Repository
		runs: CommandRun[]
		showShortcuts: boolean
		tooltip: string
	} = $props()
	const run = $derived(runs.find((item) => item.id === columnId))
	const result = $derived(run?.results[repository.id])
	const display = $derived(getColumnDisplay(columnId))
</script>

{#if columnId === 'relativePath'}<RepositoryCell
		{onOpen}
		{onRefresh}
		{repository}
		{showShortcuts}
		{tooltip}
	/>
{:else if columnId === 'name'}<span
		class="project-name"
		title={repository.description === '' ? tooltip : `${tooltip}\n${repository.description}`}
		>{repository.name}</span
	>
{:else if columnId === 'branch'}<span class="branch" title={tooltip}
		>⑂ {repository.branch === ''
			? getMetadataPlaceholder(repository, 'branch')
			: repository.branch}</span
	>
{:else if columnId === 'changedFiles'}<span
		class="status-badge"
		class:dirty={repository.changedFiles > 0}
		><span class="status-dot"></span>{repository.gitStatusAvailable
			? repository.changedFiles > 0
				? `${repository.changedFiles} Changed`
				: 'Clean'
			: getMetadataPlaceholder(repository, 'changedFiles')}</span
	>
{:else if columnId === 'sync'}<span
		class="sync-value"
		title={`${tooltip}\nTotals across locally cached remotes; no fetch is performed`}
		>{repository.ahead > 0 || repository.behind > 0
			? `↑${repository.ahead} ↓${repository.behind}`
			: '—'}</span
	>
{:else if columnId === 'lastCommitDate'}<span
		class="date-value"
		title={repository.lastCommit === '' ? tooltip : `${tooltip}\n${repository.lastCommit}`}
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
{:else}<span class="cell-text" class:monospace={display !== 'text'} title={tooltip}
		>{formatColumnCellValue(repository, columnId, runs)}</span
	>{/if}
