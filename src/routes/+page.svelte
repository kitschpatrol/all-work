<script lang="ts">
	import type { ColumnDef, Row, RowSelectionState } from '@tanstack/svelte-table'
	import type { CommandRun, Repository, StreamEvent, Workspace } from '#lib/workspace.js'
	import {
		columnFilteringFeature,
		columnResizingFeature,
		columnSizingFeature,
		columnVisibilityFeature,
		createFilteredRowModel,
		createSortedRowModel,
		createTable,
		filterFn_includesString,
		globalFilteringFeature,
		rowSelectionFeature,
		rowSortingFeature,
		sortFn_alphanumeric,
		tableFeatures,
	} from '@tanstack/svelte-table'
	import { getGithubUrl } from '#lib/repository-links.js'
	import { onMount, tick } from 'svelte'
	import { on } from 'svelte/events'
	import { SvelteMap } from 'svelte/reactivity'
	import type { PageProps } from './$types'

	const { data }: PageProps = $props()
	let directory = $state('')
	let recursive = $state(true)
	let workspace: undefined | Workspace = $state()
	let loading = $state(false)
	let starting = $state(false)
	let errorMessage = $state('')
	let command = $state('')
	let concurrency = $state(6)
	let autoClear = $state(false)
	let search = $state('')
	let status = $state('all')
	let selectedOnly = $state(false)
	let selectCount = $state(10)
	let rowSelection: RowSelectionState = $state({})
	let runs: CommandRun[] = $state([])
	let inspected: undefined | { repositoryId: string; runId: string } = $state()
	let outputDialog: HTMLDialogElement
	let tableScroll: HTMLDivElement
	let eventStream: undefined | { close: () => void }
	const autoClearPredecessors = new SvelteMap<string, string>()

	const features = tableFeatures({
		columnFilteringFeature,
		columnResizingFeature,
		columnSizingFeature,
		columnVisibilityFeature,
		filteredRowModel: createFilteredRowModel(),
		filterFns: { includesString: filterFn_includesString },
		globalFilteringFeature,
		rowSelectionFeature,
		rowSortingFeature,
		sortedRowModel: createSortedRowModel(),
		sortFns: { alphanumeric: sortFn_alphanumeric },
	})

	const columns = $derived<Array<ColumnDef<typeof features, Repository>>>([
		{
			enableHiding: false,
			enableResizing: false,
			enableSorting: false,
			header: '',
			id: 'select',
			maxSize: 46,
			minSize: 46,
			size: 46,
		},
		{ accessorKey: 'name', enableHiding: false, header: 'Repository', minSize: 240, size: 310 },
		{ accessorKey: 'branch', header: 'Branch', size: 150 },
		{
			accessorKey: 'changedFiles',
			filterFn(row: Row<typeof features, Repository>, _columnId: string, value: unknown) {
				if (!row.original.gitStatusAvailable) {
					return false
				}

				return value === 'dirty'
					? row.original.changedFiles > 0
					: value !== 'clean' || row.original.changedFiles === 0
			},
			header: 'Working tree',
			size: 140,
		},
		{
			accessorFn: (repository: Repository) => repository.ahead + repository.behind,
			header: 'Sync',
			id: 'sync',
			size: 100,
		},
		{ accessorKey: 'lastCommitDate', header: 'Last commit', size: 140 },
		{ accessorKey: 'version', header: 'Version', size: 100 },
		{ accessorKey: 'packageManager', header: 'Package manager', size: 170 },
		{ accessorKey: 'remote', header: 'Remote', size: 260 },
		{ accessorKey: 'relativePath', header: 'Path', size: 240 },
		...runs.map((run): ColumnDef<typeof features, Repository> => ({
			accessorFn: (repository: Repository) => run.results[repository.id]?.output ?? '',
			enableGlobalFilter: false,
			enableSorting: false,
			header: run.command,
			id: run.id,
			minSize: 220,
			size: 340,
		})),
	])
	const repositories = $derived(
		(workspace?.repositories ?? []).filter(
			(repository) => !selectedOnly || rowSelection[repository.id],
		),
	)
	const table = createTable({
		columnResizeMode: 'onChange',
		get columns() {
			return columns
		},
		get data() {
			return repositories
		},
		defaultColumn: { maxSize: 900, minSize: 80, sortFn: 'alphanumeric' },
		features,
		getRowId: getRepositoryId,
		globalFilterFn: 'includesString',
		initialState: {
			columnVisibility: { packageManager: false, relativePath: false, remote: false },
			sorting: [{ desc: false, id: 'name' }],
		},
		onRowSelectionChange(updater) {
			rowSelection = typeof updater === 'function' ? updater(rowSelection) : updater
		},
		state: {
			get rowSelection() {
				return rowSelection
			},
		},
	})
	const visibleRepositories = $derived(table.getRowModel().rows)
	const targets = $derived(visibleRepositories.filter((row) => rowSelection[row.id]))
	const selectedCount = $derived(Object.values(rowSelection).filter(Boolean).length)
	const activeRuns = $derived(runs.filter((run) => !run.finished))
	const dirtyCount = $derived(
		workspace?.repositories.filter((repository) => repository.changedFiles > 0).length ?? 0,
	)
	const inspectedRun = $derived(runs.find((run) => run.id === inspected?.runId))
	const inspectedRepository = $derived(
		workspace?.repositories.find((repository) => repository.id === inspected?.repositoryId),
	)
	const inspectedResult = $derived(
		inspected === undefined ? undefined : inspectedRun?.results[inspected.repositoryId],
	)

	onMount(() => {
		directory = localStorage.getItem('allwork.directory') ?? data.defaultDirectory
		recursive = localStorage.getItem('allwork.recursive') !== 'false'
		autoClear = localStorage.getItem('allwork.autoClear') === 'true'
		return closeStreams
	})

	function closeStreams() {
		eventStream?.close()
		eventStream = undefined
	}

	async function request<T>(
		url: string,
		body: Record<string, unknown>,
		method = 'POST',
	): Promise<T> {
		const response = await fetch(url, {
			body: JSON.stringify(body),
			headers: { 'Content-Type': 'application/json', 'X-Allwork-Request': '1' },
			method,
		})
		const result: unknown = await response.json()
		if (!response.ok) {
			throw new Error(
				typeof result === 'object' && result !== null && 'message' in result
					? String(result.message)
					: 'The request failed.',
			)
		}

		return result as T
	}

	async function loadDirectory() {
		if (loading || activeRuns.length > 0) {
			return
		}

		loading = true
		errorMessage = ''
		try {
			const next = await request<Workspace>('/api/workspace', {
				directory,
				previousWorkspaceId: workspace?.id,
				recursive,
			})
			if (next.directory === workspace?.directory) {
				const repositoryIds = new Set(next.repositories.map((repository) => repository.id))
				rowSelection = Object.fromEntries(
					Object.entries(rowSelection).filter(([id]) => repositoryIds.has(id)),
				)
			} else {
				await Promise.all(runs.map(async (run) => request(`/api/runs/${run.id}`, {}, 'DELETE')))
				closeStreams()
				runs = []
				autoClearPredecessors.clear()
				rowSelection = {}
				selectedOnly = false
				search = ''
				status = 'all'
				table.setGlobalFilter('')
				table.resetColumnFilters()
			}

			workspace = next
			directory = next.directory
			localStorage.setItem('allwork.directory', directory)
			localStorage.setItem('allwork.recursive', String(next.recursive))
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error)
		} finally {
			loading = false
		}
	}

	async function browseDirectory() {
		try {
			const chosen = await globalThis._allwork?.chooseDirectory()
			if (chosen !== undefined) {
				directory = chosen
				await loadDirectory()
			}
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error)
		}
	}

	function watchRuns() {
		closeStreams()
		const ids = runs.filter((run) => !run.finished).map((run) => run.id)
		if (ids.length === 0) {
			return
		}

		// eslint-disable-next-line node/no-unsupported-features/node-builtins -- This EventSource runs in the browser.
		const stream = new EventSource(`/api/runs/events?ids=${ids.join(',')}`)
		eventStream = stream
		on(stream, 'message', (message) => {
			if (!(message instanceof MessageEvent)) {
				return
			}

			const event = JSON.parse(String(message.data)) as StreamEvent
			const run = runs.find((item) => item.id === event.runId)
			if (run === undefined) {
				return
			}

			if (event.type === 'snapshot') {
				Object.assign(run, event.run)
			} else if (event.type === 'result') {
				run.results[event.result.repositoryId] = event.result
			} else {
				run.finished = true
			}

			if (run.finished) {
				clearPreviousOutputs()
			}

			if (runs.every((item) => item.finished)) {
				closeStreams()
			}
		})

		on(stream, 'error', () => {
			if (stream.readyState !== 2) {
				return
			}

			errorMessage =
				'Lost the command stream. The server may have restarted. Reload the folder to reconnect.'
			closeStreams()
		})
	}

	async function runCommand() {
		if (workspace === undefined || starting || targets.length === 0 || command.trim() === '') {
			return
		}

		starting = true
		errorMessage = ''
		const previousRunId = autoClear ? runs.at(-1)?.id : undefined
		try {
			const run = await request<CommandRun>('/api/runs', {
				command,
				concurrency,
				repositoryIds: targets.map((row) => row.id),
				workspaceId: workspace.id,
			})
			runs = [...runs, run]
			if (previousRunId !== undefined) {
				autoClearPredecessors.set(run.id, previousRunId)
			}

			clearPreviousOutputs()
			watchRuns()
			await tick()
			tableScroll.scrollLeft = tableScroll.scrollWidth
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error)
		} finally {
			starting = false
		}
	}

	async function stop(runId: string) {
		try {
			await request(`/api/runs/${runId}`, {}, 'PATCH')
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error)
		}
	}

	async function removeRun(runId: string) {
		try {
			await request(`/api/runs/${runId}`, {}, 'DELETE')
			runs = runs.filter((run) => run.id !== runId)
			autoClearPredecessors.delete(runId)
			if (inspected?.runId === runId) {
				outputDialog.close()
			}

			watchRuns()
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error)
		}
	}

	function clearPreviousOutputs() {
		for (const [runId, previousRunId] of autoClearPredecessors) {
			const run = runs.find((item) => item.id === runId)
			const previous = runs.find((item) => item.id === previousRunId)
			if (run === undefined || previous === undefined) {
				autoClearPredecessors.delete(runId)
			} else if (run.finished && previous.finished) {
				autoClearPredecessors.delete(runId)
				void removeRun(previousRunId)
			}
		}
	}

	function selectMatching() {
		const ids = visibleRepositories.slice(0, Math.max(1, selectCount)).map((row) => row.id)
		rowSelection = { ...rowSelection, ...Object.fromEntries(ids.map((id) => [id, true as const])) }
	}

	function toggleMatching(event: Event) {
		const { checked } = event.currentTarget as HTMLInputElement
		const matchingIds = new Set(visibleRepositories.map((row) => row.id))
		rowSelection = checked
			? {
					...rowSelection,
					...Object.fromEntries(visibleRepositories.map((row) => [row.id, true as const])),
				}
			: Object.fromEntries(Object.entries(rowSelection).filter(([id]) => !matchingIds.has(id)))
	}

	function inspect(runId: string, repositoryId: string) {
		inspected = { repositoryId, runId }
		outputDialog.showModal()
	}

	async function copyOutput() {
		try {
			await navigator.clipboard.writeText(inspectedResult?.output ?? '')
		} catch {
			errorMessage = 'Could not copy output to the clipboard.'
		}
	}

	function formatDate(value: string) {
		return value === ''
			? 'No commits'
			: new Date(value).toLocaleDateString(undefined, {
					day: 'numeric',
					month: 'short',
					year: 'numeric',
				})
	}

	function getRepositoryId(repository: Repository) {
		return repository.id
	}

	async function openInApp(repository: Repository, app: 'finder' | 'tower') {
		if (workspace === undefined) {
			return
		}

		try {
			await request(`/api/repositories/${app}`, {
				repositoryId: repository.id,
				workspaceId: workspace.id,
			})
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error)
		}
	}

	function vscodeUrl(repositoryPath: string) {
		const normalized = repositoryPath.replaceAll('\\', '/')
		const absolute = normalized.startsWith('/') ? normalized : `/${normalized}`
		const encoded = absolute
			.split('/')
			.map((segment) => encodeURIComponent(segment))
			.join('/')
		return `vscode://file${encoded}/`
	}

	function runProgress(run: CommandRun) {
		const results = Object.values(run.results)
		return `${results.filter((result) => result.status !== 'queued' && result.status !== 'running').length}/${results.length}`
	}
</script>

{#snippet githubIcon()}
	<svg aria-hidden="true" fill="currentColor" height="16" viewBox="0 0 24 24" width="16">
		<path
			d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.01-.12-.29-.5-1.43.11-2.97 0 0 .94-.3 3.09 1.15a10.75 10.75 0 0 1 5.62 0c2.15-1.45 3.09-1.15 3.09-1.15.61 1.54.23 2.68.11 2.97.72.78 1.16 1.78 1.16 3.01 0 4.32-2.63 5.27-5.14 5.55.4.35.76 1.03.76 2.08v3.11c0 .3.2.65.77.54A11.25 11.25 0 0 0 12 .75Z"
		/>
	</svg>
{/snippet}

<svelte:head>
	<title>AllWork — a command line for all your repositories</title>
	<meta
		name="description"
		content="Discover Git repositories, select a working set, and run shell commands in parallel."
	/>
</svelte:head>

<div class="app-shell">
	<header class="app-toolbar">
		<div class="workspace-tools">
			<h1>AllWork</h1>
			<form
				class="directory-form"
				aria-label="Load a workspace"
				onsubmit={(event) => {
					event.preventDefault()
					void loadDirectory()
				}}
			>
				<label class="field-label" for="workspace-directory">Workspace</label>
				<input
					id="workspace-directory"
					aria-label="Workspace directory"
					disabled={loading || activeRuns.length > 0}
					placeholder="/path/to/your/projects"
					bind:value={directory}
				/>
				<label
					class="recursive-option"
					title="Search all nested folders. Uncheck to scan only this folder and its immediate children."
				>
					<input
						aria-label="Recursive repository discovery"
						disabled={loading || activeRuns.length > 0}
						type="checkbox"
						bind:checked={recursive}
					/>
					Recursive
				</label>
				{#if typeof window !== 'undefined' && globalThis._allwork !== undefined}<button
						class="button subtle"
						disabled={loading || activeRuns.length > 0}
						onclick={async () => browseDirectory()}
						type="button">Browse…</button
					>{/if}
				<button
					class="button subtle"
					disabled={directory.trim() === '' || loading || activeRuns.length > 0}
					type="submit"
					>{loading ? 'Scanning…' : workspace === undefined ? 'Load' : 'Reload ↻'}</button
				>
			</form>
		</div>
		<form
			class="command-form"
			aria-label="Run a command"
			onsubmit={(event) => {
				event.preventDefault()
				void runCommand()
			}}
		>
			<label class="field-label" for="shell-command">Command</label>
			<span class="prompt-symbol" aria-hidden="true">$</span>
			<input
				id="shell-command"
				aria-label="Shell command"
				autocomplete="off"
				placeholder="git status --short"
				spellcheck="false"
				bind:value={command}
			/>
			<label class="parallel-label"
				><span>Jobs</span>
				<input
					aria-label="Parallel jobs"
					max="32"
					min="1"
					required
					type="number"
					bind:value={concurrency}
				/></label
			>
			<label
				class="auto-clear-option"
				title="Delete the preceding output column when this run finishes. Active commands finish before their output is cleared."
			>
				<input
					aria-label="Auto clear"
					onchange={(event) =>
						localStorage.setItem('allwork.autoClear', String(event.currentTarget.checked))}
					type="checkbox"
					bind:checked={autoClear}
				/>
				Auto clear
			</label>
			<button
				class="button primary run-button"
				disabled={targets.length === 0 || command.trim() === '' || starting || loading}
				type="submit">▶ {starting ? 'Starting…' : `Run in ${targets.length}`}</button
			>
		</form>
	</header>
	<main>
		{#if errorMessage !== ''}<div class="message error" role="alert">
				<span>{errorMessage}</span><button
					aria-label="Dismiss error"
					onclick={() => {
						errorMessage = ''
					}}
					type="button">×</button
				>
			</div>{/if}
		{#if workspace !== undefined && workspace.warnings.length > 0}<details class="message">
				<summary>{workspace.warnings.length} directories could not be read</summary
				>{#each workspace.warnings as warning (warning)}<p>{warning}</p>{/each}
			</details>{/if}

		<section class="repositories-panel" aria-label="Repositories">
			<div class="table-toolbar">
				<div class="filters">
					<div class="search-field">
						<span aria-hidden="true">⌕</span><input
							aria-label="Filter repositories"
							oninput={() => table.setGlobalFilter(search)}
							placeholder="Filter repositories…"
							bind:value={search}
						/>
					</div>
					<select
						aria-label="Working tree filter"
						onchange={() =>
							table
								.getColumn('changedFiles')
								?.setFilterValue(status === 'all' ? undefined : status)}
						bind:value={status}
						><option value="all">All working trees</option><option value="dirty"
							>With changes</option
						><option value="clean">Clean</option></select
					><label class="selected-filter"
						><input type="checkbox" bind:checked={selectedOnly} /> Selected only</label
					>
				</div>
				<div class="selection-tools">
					<span
						>{targets.length} selected{selectedCount > targets.length
							? ` · ${selectedCount - targets.length} hidden`
							: ''}</span
					><label
						>First <input
							aria-label="Number of repositories to select"
							max={Math.max(1, visibleRepositories.length)}
							min="1"
							type="number"
							bind:value={selectCount}
						/></label
					><button
						class="text-button"
						disabled={visibleRepositories.length === 0}
						onclick={selectMatching}
						type="button">Select</button
					><button
						class="text-button muted"
						disabled={selectedCount === 0}
						onclick={() => {
							rowSelection = {}
						}}
						type="button">Clear</button
					>
				</div>
				<div class="table-title-actions">
					{#if activeRuns.length > 0}<span class="running-indicator"
							><span class="connection-dot"></span>{activeRuns.length} running</span
						>{/if}{#if runs.some((run) => run.finished)}<button
							class="button subtle"
							onclick={() => {
								for (const run of runs) {
									if (run.finished) {
										void removeRun(run.id)
									}
								}
							}}
							type="button">Clear finished runs</button
						>{/if}
					<details class="column-menu">
						<summary class="button subtle">Columns ▾</summary>
						<div class="column-options">
							{#each table
								.getAllLeafColumns()
								.filter((column) => column.getCanHide()) as column (column.id)}<label
									><input
										checked={column.getIsVisible()}
										onchange={(event) => column.toggleVisibility(event.currentTarget.checked)}
										type="checkbox"
									/>{String(column.columnDef.header)}</label
								>{/each}
						</div>
					</details>
				</div>
			</div>
			<div bind:this={tableScroll} class="table-scroll">
				<table style:width="{table.getTotalSize()}px">
					<thead
						>{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}<tr
								>{#each headerGroup.headers as header (header.id)}{@const run = runs.find(
										(item) => item.id === header.column.id,
									)}<th
										style:width="{header.getSize()}px"
										class:output-header={run !== undefined}
										class:repository-cell={header.column.id === 'name'}
										class:selection-cell={header.column.id === 'select'}
										aria-sort={header.column.getIsSorted() === 'asc'
											? 'ascending'
											: header.column.getIsSorted() === 'desc'
												? 'descending'
												: undefined}
									>
										{#if header.column.id === 'select'}<input
												aria-label="Select all matching repositories"
												checked={visibleRepositories.length > 0 &&
													targets.length === visibleRepositories.length}
												disabled={visibleRepositories.length === 0}
												indeterminate={targets.length > 0 &&
													targets.length < visibleRepositories.length}
												onchange={toggleMatching}
												type="checkbox"
											/>
										{:else if run !== undefined}<div class="run-header">
												<div>
													<span class="run-label"
														>RUN {runs.indexOf(run) + 1}
														<span>{runProgress(run)}{run.finished ? ' complete' : ' running'}</span
														></span
													><code title={run.command}>$ {run.command}</code>
												</div>
												<div>
													{#if !run.finished}<button
															class="stop-button"
															aria-label="Stop command"
															onclick={async () => stop(run.id)}
															type="button">■</button
														>{/if}<button
														class="remove-button"
														aria-label="Delete output column"
														onclick={async () => removeRun(run.id)}
														type="button">×</button
													>
												</div>
											</div>
										{:else}<button
												class="sort-button"
												disabled={!header.column.getCanSort()}
												onclick={(event) => header.column.toggleSorting(undefined, event.shiftKey)}
												type="button"
												>{String(header.column.columnDef.header)}<span
													class:sorted={header.column.getIsSorted() !== false}
													>{header.column.getIsSorted() === 'asc'
														? '↑'
														: header.column.getIsSorted() === 'desc'
															? '↓'
															: '↕'}</span
												></button
											>{/if}
										{#if header.column.getCanResize()}<button
												class="resize-handle"
												aria-label="Resize column"
												ondblclick={() => header.column.resetSize()}
												onmousedown={header.getResizeHandler()}
												ontouchstart={header.getResizeHandler()}
												type="button"
											></button>{/if}
									</th>{/each}</tr
							>{/each}</thead
					>
					<tbody
						>{#each table.getRowModel().rows as row (row.id)}<tr
								class:selected={row.getIsSelected()}
								>{#each row.getVisibleCells() as cell (cell.id)}{@const repository =
										row.original}{@const run = runs.find(
										(item) => item.id === cell.column.id,
									)}{@const result = run?.results[repository.id]}<td
										style:width="{cell.column.getSize()}px"
										class:output-cell={run !== undefined}
										class:repository-cell={cell.column.id === 'name'}
										class:selection-cell={cell.column.id === 'select'}
									>
										{#if cell.column.id === 'select'}<input
												aria-label="Select {repository.name}"
												checked={row.getIsSelected()}
												onchange={row.getToggleSelectedHandler()}
												type="checkbox"
											/>
										{:else if cell.column.id === 'name'}{@const githubUrl = getGithubUrl(
												repository.remote,
											)}
											<div class="repository-heading">
												<div
													class="repository-name"
													title={repository.description === ''
														? repository.path
														: repository.description}
												>
													<span class="repo-symbol" aria-hidden="true">▣</span><strong
														>{repository.name}</strong
													>
												</div>
												<div class="repository-actions">
													<button
														class="repository-action"
														aria-label="Open {repository.name} in Tower"
														onclick={async () => openInApp(repository, 'tower')}
														title="Open in Tower"
														type="button"
													>
														<svg
															aria-hidden="true"
															fill="none"
															height="16"
															viewBox="0 0 16 16"
															width="16"
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
														<svg
															aria-hidden="true"
															fill="none"
															height="16"
															viewBox="0 0 16 16"
															width="16"
															><path
																d="m11 1.5 3 1.3v10.4l-3 1.3-7-5.2-2 1.5-1-1V6.2l1-1 2 1.5 7-5.2Z"
																stroke="currentColor"
																stroke-linejoin="round"
															/><path
																d="M11 1.5v13M4 6.7 11 12M4 9.3 11 4"
																stroke="currentColor"
															/></svg
														>
													</a>
													{#if githubUrl !== undefined}
														<a
															class="repository-action"
															aria-label="Open {repository.name} in GitHub"
															href={githubUrl}
															rel="external noopener noreferrer"
															target="_blank"
															title="Open in GitHub">{@render githubIcon()}</a
														>
													{:else}
														<button
															class="repository-action"
															aria-label="No GitHub origin remote for {repository.name}"
															disabled
															title="No GitHub origin remote"
															type="button">{@render githubIcon()}</button
														>
													{/if}
													<button
														class="repository-action"
														aria-label="Open {repository.name} in Finder"
														onclick={async () => openInApp(repository, 'finder')}
														title="Open in Finder"
														type="button"
													>
														<svg
															aria-hidden="true"
															fill="none"
															height="16"
															viewBox="0 0 16 16"
															width="16"
															><path
																d="M1.5 4a1 1 0 0 1 1-1H6l1.5 2h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4Z"
																stroke="currentColor"
																stroke-linejoin="round"
															/></svg
														>
													</button>
												</div>
											</div>
											<div class="repository-path" title={repository.path}>
												{repository.relativePath}
											</div>
											{#if repository.error !== undefined}<span
													class="metadata-error"
													title={repository.error}>Metadata incomplete</span
												>{/if}
										{:else if cell.column.id === 'branch'}<span
												class="branch"
												title={repository.branch}
												>⑂ {repository.branch === '' ? 'Unknown' : repository.branch}</span
											>
										{:else if cell.column.id === 'changedFiles'}<span
												class="status-badge"
												class:dirty={repository.changedFiles > 0}
												><span class="status-dot"></span>{repository.gitStatusAvailable
													? repository.changedFiles > 0
														? `${repository.changedFiles} changed`
														: 'Clean'
													: 'Unavailable'}</span
											>
										{:else if cell.column.id === 'sync'}<span
												class="sync-value"
												title="Compared with the locally cached upstream; no fetch is performed"
												>{repository.ahead > 0 || repository.behind > 0
													? `↑${repository.ahead} ↓${repository.behind}`
													: '—'}</span
											>
										{:else if cell.column.id === 'lastCommitDate'}<span
												class="date-value"
												title={repository.lastCommit}>{formatDate(repository.lastCommitDate)}</span
											>
										{:else if run !== undefined}{#if result !== undefined}<button
													class="output-preview"
													onclick={() => inspect(run.id, repository.id)}
													type="button"
													><span
														class="result-meta"
														class:failed={result.status === 'failed'}
														class:success={result.status === 'success'}
														><span class="status-dot"></span>{result.status}{result.exitCode ===
														undefined
															? ''
															: ` · exit ${result.exitCode}`}<span class="result-duration"
															>{result.duration === undefined
																? ''
																: `${(result.duration / 1000).toFixed(1)}s`} ↗</span
														></span
													>
													<pre>{result.output === ''
															? result.status === 'queued'
																? 'Waiting for a slot…'
																: result.status === 'running'
																	? 'Running…'
																	: 'No output'
															: result.output}{result.truncated
															? '\n[Output limit reached]'
															: ''}</pre></button
												>{:else}<span class="not-targeted">Not included in this run</span>{/if}
										{:else}<span class="cell-text" title={String(cell.getValue<number | string>())}
												>{String(cell.getValue<number | string>())}</span
											>{/if}
									</td>{/each}</tr
							>{/each}</tbody
					>
				</table>
				{#if table.getRowModel().rows.length === 0}<div class="empty-state">
						<div class="empty-icon" aria-hidden="true">{loading ? '↻' : '⌘'}</div>
						<h3>
							{loading
								? 'Finding your repositories'
								: workspace === undefined
									? 'All your repositories. One working surface.'
									: workspace.repositories.length === 0
										? 'No Git repositories found'
										: 'No matching repositories'}
						</h3>
						<p>
							{loading
								? 'Reading local Git status and project metadata…'
								: workspace === undefined
									? 'Load a folder, select a few projects, and put a command to work.'
									: workspace.repositories.length === 0
										? 'Try a folder that contains Git repositories or worktrees.'
										: 'Adjust your filters or turn off “Selected only” to see more projects.'}
						</p>
					</div>{/if}
			</div>
			<footer class="table-footer">
				<span
					>{visibleRepositories.length} of {workspace?.repositories.length ?? 0} repositories
					<span class="caption-divider">·</span>
					{dirtyCount} with changes <span class="caption-divider">·</span>
					{runs.length} command {runs.length === 1 ? 'run' : 'runs'}</span
				>
				<span>Metascope <span class="caption-divider">·</span> Session history</span>
			</footer>
		</section>
	</main>
</div>

<dialog
	bind:this={outputDialog}
	class="output-dialog"
	onclose={() => {
		inspected = undefined
	}}
>
	<div class="dialog-heading">
		<div>
			<span class="eyebrow">{inspectedRepository?.name}</span>
			<h2><code>$ {inspectedRun?.command}</code></h2>
			<p>{inspectedRepository?.path}</p>
		</div>
		<button
			class="remove-button"
			aria-label="Close output"
			onclick={() => outputDialog.close()}
			type="button">×</button
		>
	</div>
	<div class="dialog-toolbar">
		<span
			>{inspectedResult?.status}{inspectedResult?.exitCode === undefined
				? ''
				: ` · exit ${inspectedResult.exitCode}`}</span
		><button class="button subtle" onclick={async () => copyOutput()} type="button"
			>Copy output</button
		>
	</div>
	<pre class="full-output">{inspectedResult?.output === ''
			? 'No output yet.'
			: (inspectedResult?.output ?? 'No output yet.')}{inspectedResult?.truncated === true
			? '\n\n[Output truncated at 128,000 characters. The command continues to run.]'
			: ''}</pre>
</dialog>
