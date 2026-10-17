<script lang="ts">
	import type { ColumnDef, RowSelectionState } from '@tanstack/svelte-table'
	import type { AppWindow } from '#lib/app-windows.js'
	import type { MenuActions, OpenTarget } from '#lib/electron-api.js'
	import type { Preferences } from '#lib/preferences.js'
	import type { SavedView } from '#lib/view-storage.js'
	import type {
		CommandRun,
		MetadataGroup,
		Repository,
		StreamEvent,
		Workspace,
	} from '#lib/workspace.js'
	import {
		columnFilteringFeature,
		columnOrderingFeature,
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
		sortFn_basic,
		sortFn_text,
		tableFeatures,
	} from '@tanstack/svelte-table'
	import AppTitle from '#lib/AppTitle.svelte'
	import AppWindows from '#lib/AppWindows.svelte'
	import CellContent from '#lib/CellContent.svelte'
	import { request } from '#lib/client-request.js'
	import { startColumnDrag } from '#lib/column-drag.js'
	import { resolveColumnOrder } from '#lib/column-order.js'
	import { startColumnResize } from '#lib/column-resize.js'
	import {
		getColumnDisplay,
		getColumnPreviewTooltip,
		getColumnTooltip,
		getColumnVariables,
		repositoryColumns,
	} from '#lib/column-variables.js'
	import CommandForm from '#lib/CommandForm.svelte'
	import { isColumnPreset, isOpenTarget } from '#lib/electron-api.js'
	import ElectronMenu from '#lib/ElectronMenu.svelte'
	import { isFilterPresetId } from '#lib/filter-presets.js'
	import FilterBar from '#lib/FilterBar.svelte'
	import { watchWorkspaceMetadata } from '#lib/metadata-stream.js'
	import MetadataControls from '#lib/MetadataControls.svelte'
	import MetadataProgress from '#lib/MetadataProgress.svelte'
	import NumberField from '#lib/NumberField.svelte'
	import { defaultPreferences } from '#lib/preferences.js'
	import { openRepositoryLink } from '#lib/repository-links.js'
	import { createRowFilter } from '#lib/row-filter-state.svelte.js'
	import { emptyFilter } from '#lib/row-filter.js'
	import { createRowSelection } from '#lib/row-selection.js'
	import { getColumnSizingValue, runProgress } from '#lib/table-formatting.js'
	import { measureColumns } from '#lib/table-sizing.js'
	import { getVisibleRepositoryIds } from '#lib/table-viewport.js'
	import ViewPersistence from '#lib/ViewPersistence.svelte'
	import { listenForWindowMessages, postWindowMessage } from '#lib/window-messages.js'
	import { onMount, tick } from 'svelte'
	import { on } from 'svelte/events'
	import { SvelteMap, SvelteSet } from 'svelte/reactivity'
	import type { PageProps } from './$types'

	const { data }: PageProps = $props()
	let directory = $state('')
	let recursive = $state(true)
	let workspace: undefined | Workspace = $state()
	let loading = $state(false)
	let starting = $state(false)
	let errorMessage = $state('')
	let command = $state('')
	let commandHistory: string[] = $state([])
	let concurrency = $state(6)
	let autoClear = $state(false)
	let search = $state('')
	let selectedOnly = $state(false)
	let outputLines = $state(3)
	let rowSelection: RowSelectionState = $state({})
	let columnOrder: string[] = $state([])
	let draggingColumnId = $state<string>()
	let runs: CommandRun[] = $state([])
	let filterInput = $state<HTMLInputElement>()
	let appWindows: {
		open: (target: AppWindow) => Promise<void>
		closeOutput: (runId: string) => void
	}
	let persistence: { reset: () => Promise<void> }
	let preferences = $state(defaultPreferences())
	let savedView = $state<SavedView>()
	let pendingScroll = $state<SavedView['scroll']>()
	let scrollPosition = $state({ left: 0, top: 0 })
	let commandForm: {
		choose: (value: string) => Promise<void>
		focus: () => void
		resetRecall: () => void
	}
	let tableScroll: HTMLDivElement
	let eventStream: undefined | { close: () => void }
	let metadataStream: undefined | { close: () => void }
	let metadataTimer: ReturnType<typeof setTimeout> | undefined
	let sizingTimer: ReturnType<typeof setTimeout> | undefined
	const requestedMetadata = new SvelteSet<string>()
	const repositoryColumnIds = new SvelteSet(repositoryColumns.map((column) => column.id))
	const autoClearPredecessors = new SvelteMap<string, string>()
	const resizedColumns = new SvelteSet<string>()
	// Metadata groups that load for rows on demand; codebase scans and dependency checks run only when requested
	const lazyGroups: ReadonlySet<MetadataGroup> = new Set(['ci', 'git', 'github', 'registry'])

	const features = tableFeatures({
		columnFilteringFeature,
		columnOrderingFeature,
		columnResizingFeature,
		columnSizingFeature,
		columnVisibilityFeature,
		filteredRowModel: createFilteredRowModel(),
		filterFns: { includesString: filterFn_includesString },
		globalFilteringFeature,
		rowSelectionFeature,
		rowSortingFeature,
		sortedRowModel: createSortedRowModel(),
		sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, text: sortFn_text },
	})
	const defaultColumnIds = new Set([
		'branch',
		'changedFiles',
		'description',
		'lastCommitDate',
		'name',
		'relativePath',
		'repoName',
		'repoOwner',
		'version',
	])

	const columns = $derived<Array<ColumnDef<typeof features, Repository>>>([
		{
			enableHiding: false,
			enableResizing: false,
			enableSorting: false,
			header: '',
			id: 'select',
			maxSize: 32,
			minSize: 32,
			size: 32,
		},
		...repositoryColumns.map((column): ColumnDef<typeof features, Repository> => ({
			accessorFn: column.value,
			enableHiding: column.id !== 'relativePath',
			header: column.header,
			id: column.id,
			minSize: column.id === 'relativePath' ? 160 : 24,
			sortFn: column.sort,
			sortUndefined: 'last',
		})),
		...runs.map((run): ColumnDef<typeof features, Repository> => ({
			accessorFn: (repository: Repository) => run.results[repository.id]?.output ?? '',
			enableGlobalFilter: false,
			header: run.command,
			id: run.id,
			minSize: 240,
			size: 240,
			sortFn: 'text',
		})),
	])
	const pinnedColumns = $derived({
		start: ['select', 'relativePath'],
		end: runs.slice(-1).map((run) => run.id),
	})
	const resolvedColumnOrder = $derived(
		resolveColumnOrder(
			columns.flatMap((column) => column.id ?? []),
			columnOrder,
			pinnedColumns,
		),
	)
	const columnVariables = $derived(getColumnVariables(runs))
	const rowFilter = createRowFilter({
		onChange() {
			scheduleMetadata()
		},
		repositories: () => workspace?.repositories ?? [],
		runs: () => runs,
	})
	const repositories = $derived(
		(workspace?.repositories ?? []).filter(
			(repository) =>
				(!selectedOnly || rowSelection[repository.id]) && rowFilter.matches(repository),
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
		defaultColumn: { maxSize: 4000, minSize: 24, size: 80, sortFn: 'alphanumeric' },
		features,
		getRowId: (repository: Repository) => repository.id,
		globalFilterFn: 'includesString',
		initialState: {
			columnVisibility: Object.fromEntries(
				repositoryColumns.map((column) => [column.id, defaultColumnIds.has(column.id)]),
			),
			sorting: [{ desc: false, id: 'relativePath' }],
		},
		state: {
			get columnOrder() {
				return resolvedColumnOrder
			},
			get rowSelection() {
				return rowSelection
			},
		},
	})
	const visibleRepositories = $derived(table.getRowModel().rows)
	const selection = createRowSelection({
		ids: () => visibleRepositories.map((row) => row.id),
		onChange(next) {
			rowSelection = next
			scheduleMetadata()
		},
		scroller: () => tableScroll,
		selection: () => rowSelection,
	})
	const targets = $derived(visibleRepositories.filter((row) => rowSelection[row.id]))
	const previewRepository = $derived(targets[0]?.original ?? visibleRepositories[0]?.original)
	const selectedCount = $derived(
		workspace === undefined ? 0 : Object.values(rowSelection).filter(Boolean).length,
	)
	const activeRuns = $derived(runs.filter((run) => !run.finished))
	const dirtyCount = $derived(
		workspace?.repositories.filter((repository) => repository.changedFiles > 0).length ?? 0,
	)

	const viewSnapshot = $derived<SavedView>({
		autoClear,
		autoClearPredecessors: Object.fromEntries(autoClearPredecessors),
		columnOrder,
		columnSizing: table.atoms.columnSizing.get(),
		columnVisibility: table.atoms.columnVisibility.get(),
		command,
		commandHistory,
		concurrency,
		directory,
		filter: rowFilter.filter,
		filterOpen: rowFilter.open,
		outputLines,
		recursive,
		resizedColumns: [...resizedColumns],
		rowSelection,
		runIds: workspace === undefined ? (savedView?.runIds ?? []) : runs.map((run) => run.id),
		scroll: pendingScroll ?? scrollPosition,
		search,
		selectedOnly,
		sorting: table.atoms.sorting.get(),
		version: 1,
		workspaceDirectory: workspace?.directory ?? savedView?.workspaceDirectory,
	})

	onMount(() => {
		const stopMessages = listenForWindowMessages((message) => {
			if (message.type === 'preferences-changed') {
				void applyPreferences(message.preferences)
			} else if (message.type === 'reset-view') {
				resetFromWindow(message.clearHistory)
			}
		})
		return () => {
			stopMessages()
			disposeStreams()
		}
	})

	function applySavedView(view: SavedView) {
		autoClearPredecessors.clear()
		for (const [id, previousId] of Object.entries(view.autoClearPredecessors)) {
			autoClearPredecessors.set(id, previousId)
		}

		autoClear = view.autoClear
		columnOrder = view.columnOrder
		command = view.command
		commandHistory = view.commandHistory
		concurrency = view.concurrency
		rowFilter.restore(view.filter, view.filterOpen)
		outputLines = view.outputLines
		recursive = view.recursive
		rowSelection = Object.fromEntries(
			Object.entries(view.rowSelection)
				.filter((entry) => entry[1])
				.map(([id]) => [id, true as const]),
		)
		search = view.search
		selectedOnly = view.selectedOnly
		resizedColumns.clear()
		for (const id of view.resizedColumns) {
			resizedColumns.add(id)
		}

		if (Object.keys(view.columnVisibility).length > 0) {
			table.setColumnVisibility(view.columnVisibility)
		}

		table.setColumnSizing(view.columnSizing)
		table.setSorting(view.sorting.filter((sort) => columns.some((column) => column.id === sort.id)))
		table.setGlobalFilter(search)
		pendingScroll = view.scroll
	}

	async function restoreView(view: SavedView, nextPreferences: Preferences) {
		preferences = nextPreferences
		savedView = view
		directory = view.directory
		applySavedView(view)
		if (preferences.restoreWorkspace && view.workspaceDirectory !== undefined) {
			directory = view.workspaceDirectory
			await loadDirectory(view)
			directory = view.directory
		} else {
			rowFilter.prune()
			await tick()
			if (Object.keys(view.columnSizing).length === 0) {
				fitColumns()
			}
		}
	}

	function restoreScrollPosition() {
		if (pendingScroll === undefined) {
			return
		}

		tableScroll.scrollLeft = pendingScroll.left
		tableScroll.scrollTop = pendingScroll.top
		scrollPosition = pendingScroll
		if (
			workspace?.repositories.every((repository) =>
				['local', 'git', 'code', 'files'].every((group) => {
					const state = repository.metadata?.groups[group as MetadataGroup]?.status
					return state !== undefined && state !== 'queued' && state !== 'loading'
				}),
			)
		) {
			pendingScroll = undefined
		}
	}

	async function applyPreferences(next: Preferences) {
		preferences = next
		if (workspace !== undefined) {
			await request('/api/workspace/metadata', {
				force: true,
				groups: ['local'],
				identity: next.identity,
				repositoryIds: workspace.repositories.map((repository) => repository.id),
				workspaceId: workspace.id,
			})
		}
	}

	async function resetView() {
		await persistence.reset()
		savedView = undefined
		pendingScroll = undefined
		directory = workspace?.directory ?? data.defaultDirectory
		recursive = true
		autoClear = false
		columnOrder = []
		command = ''
		concurrency = 6
		outputLines = 3
		commandForm.resetRecall()
		rowSelection = {}
		search = ''
		rowFilter.restore(emptyFilter(), false)
		selectedOnly = false
		resizedColumns.clear()
		table.resetColumnVisibility()
		table.resetColumnSizing()
		table.resetSorting()
		table.setGlobalFilter('')
		await tick()
		fitColumns()
		tableScroll.scrollLeft = 0
		tableScroll.scrollTop = 0
		scrollPosition = { left: 0, top: 0 }
	}

	function disposeStreams() {
		closeStreams()
		metadataStream?.close()
		clearTimeout(metadataTimer)
		clearTimeout(sizingTimer)
	}

	function fitColumns(columnIds?: string[], { automatic = true, growOnly = false } = {}) {
		const followEnd =
			runs.length > 0 &&
			tableScroll.scrollLeft > 0 &&
			tableScroll.scrollLeft + tableScroll.clientWidth >= tableScroll.scrollWidth - 2
		const maxWidth = automatic
			? Math.min(180, Math.floor(tableScroll.clientWidth * 0.12))
			: Infinity
		const maxRunWidth = automatic ? Math.floor(tableScroll.clientWidth * 0.2) : Infinity
		const selected = table
			.getVisibleLeafColumns()
			.filter(
				(column) =>
					column.getCanResize() && (columnIds === undefined || columnIds.includes(column.id)),
			)
		const { rows } = table.getRowModel()
		const sizes = measureColumns(
			tableScroll,
			selected.map((column) => ({
				header: String(column.columnDef.header),
				id: column.id,
				maxSize: Math.min(
					column.columnDef.maxSize ?? 4000,
					column.id === 'relativePath'
						? maxWidth * 2
						: repositoryColumnIds.has(column.id)
							? maxWidth
							: maxRunWidth,
				),
				values: rows.map((row) => getColumnSizingValue(row.original, column.id, runs)),
			})),
		)
		for (const column of selected) {
			sizes[column.id] = Math.max(
				column.columnDef.minSize ?? 24,
				sizes[column.id] ?? column.getSize(),
				growOnly ? column.getSize() : 0,
			)
		}

		if (selected.every((column) => sizes[column.id] === column.getSize())) {
			return
		}

		table.setColumnSizing((previous) => ({ ...previous, ...sizes }))
		if (followEnd) {
			void tick().then(() => {
				tableScroll.scrollLeft = tableScroll.scrollWidth
			})
		}
	}

	async function sizeRunColumn(runId: string, reveal = false) {
		const followEnd =
			reveal || tableScroll.scrollLeft + tableScroll.clientWidth >= tableScroll.scrollWidth - 2
		await tick()
		fitColumns([runId])
		await tick()
		if (followEnd) {
			tableScroll.scrollLeft = tableScroll.scrollWidth
		}
	}

	function refreshOutputSorting(runId: string) {
		const column = table.getColumn(runId)
		if (workspace !== undefined && column !== undefined && column.getIsSorted() !== false) {
			workspace.repositories = [...workspace.repositories]
		}
	}

	function sortOutput(runId: string, multiple: boolean) {
		if (workspace !== undefined) {
			workspace.repositories = [...workspace.repositories]
		}

		table.getColumn(runId)?.toggleSorting(undefined, multiple)
		scheduleMetadata()
	}

	function closeStreams() {
		eventStream?.close()
		eventStream = undefined
	}

	async function loadDirectory(restored?: SavedView) {
		if (loading || activeRuns.length > 0) {
			return
		}

		restored ??=
			workspace === undefined && directory.trim() === savedView?.workspaceDirectory
				? savedView
				: undefined

		loading = true
		errorMessage = ''
		try {
			const next = await request<Workspace>('/api/workspace', {
				directory,
				identity: preferences.identity,
				previousWorkspaceId: workspace?.id,
				recursive,
			})
			if (restored !== undefined) {
				runs = await request<CommandRun[]>('/api/runs/restore', {
					ids: restored.runIds,
					workspaceId: next.id,
				})
				applySavedView(restored)
				rowFilter.prune()
				const repositoryIds = new Set(next.repositories.map((repository) => repository.id))
				rowSelection = Object.fromEntries(
					Object.entries(rowSelection).filter(([id]) => repositoryIds.has(id)),
				)
				clearPreviousOutputs()
				watchRuns()
			} else if (next.directory === workspace?.directory) {
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
				rowFilter.set(emptyFilter())
				resizedColumns.clear()
				table.resetColumnSizing()
				table.resetSorting()
				table.setGlobalFilter('')
			}

			metadataStream?.close()
			clearTimeout(metadataTimer)
			clearTimeout(sizingTimer)
			metadataTimer = undefined
			sizingTimer = undefined
			requestedMetadata.clear()
			workspace = next
			watchMetadata(next.id)
			directory = next.directory
			await tick()
			if (restored === undefined || Object.keys(restored.columnSizing).length === 0) {
				fitColumns(
					table
						.getAllLeafColumns()
						.filter((column) => !resizedColumns.has(column.id))
						.map((column) => column.id),
				)
			}

			restoreScrollPosition()
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error)
		} finally {
			loading = false
		}
	}

	function watchMetadata(workspaceId: string) {
		metadataStream = watchWorkspaceMetadata(
			workspaceId,
			(rows, snapshot) => {
				if (workspace?.id !== workspaceId) {
					return
				}

				if (snapshot) {
					workspace.repositories = rows
				} else {
					const replacements = new Map(rows.map((repository) => [repository.id, repository]))
					for (const repository of workspace.repositories) {
						const update = replacements.get(repository.id)
						if (update !== undefined) {
							Object.assign(repository, update)
						}
					}

					if (
						search !== '' ||
						table.atoms.sorting.get().some((entry) => entry.id !== 'relativePath')
					) {
						refreshTableData()
					}
				}

				scheduleMetadata()
				void tick().then(restoreScrollPosition)
				sizingTimer ??= setTimeout(() => {
					sizingTimer = undefined
					void tick().then(() =>
						fitColumns(
							table
								.getVisibleLeafColumns()
								.filter(
									(column) => !resizedColumns.has(column.id) && repositoryColumnIds.has(column.id),
								)
								.map((column) => column.id),
							{ growOnly: true },
						),
					)
				}, 1000)
			},
			() => {
				errorMessage = 'Metadata stream disconnected. Reload the folder to reconnect.'
			},
		)
	}

	function refreshTableData() {
		if (workspace !== undefined) {
			workspace.repositories = [...workspace.repositories]
		}
	}

	function scheduleMetadata() {
		metadataTimer ??= setTimeout(() => {
			metadataTimer = undefined
			void loadVisibleMetadata()
		}, 200)
	}

	async function loadVisibleMetadata() {
		if (workspace === undefined) {
			return
		}

		const workspaceId = workspace.id
		const visibleIds = getVisibleRepositoryIds(
			tableScroll,
			targets.map((row) => row.id),
		)
		// Rules decide which rows appear, so the groups they read load for every row
		const filterGroups = rowFilter.groups.filter((group) => lazyGroups.has(group))
		const allIds = workspace.repositories.map((repository) => repository.id)
		const groups = new Set([
			...filterGroups,
			...table
				.getVisibleLeafColumns()
				.map((column) => repositoryColumns.find((entry) => entry.id === column.id)?.group)
				.filter((group): group is MetadataGroup => group !== undefined && lazyGroups.has(group)),
		])
		for (const group of groups) {
			const ids = filterGroups.includes(group) ? allIds : visibleIds
			const pending = ids.filter((id) => !requestedMetadata.has(`${id}:${group}`))
			if (pending.length === 0) {
				continue
			}

			for (const id of pending) {
				requestedMetadata.add(`${id}:${group}`)
			}

			try {
				await request('/api/workspace/metadata', {
					groups: [group],
					repositoryIds: pending,
					workspaceId,
				})
				if (workspace.id !== workspaceId) {
					return
				}
			} catch (error) {
				if (workspace.id !== workspaceId) {
					return
				}

				if (!loading) {
					errorMessage = error instanceof Error ? error.message : String(error)
				}
			}
		}
	}

	async function refreshMetadata(groups: MetadataGroup[]) {
		if (workspace === undefined || selectedCount === 0) {
			return
		}

		try {
			await request('/api/workspace/metadata', {
				force: true,
				groups,
				repositoryIds: workspace.repositories
					.filter((repository) => rowSelection[repository.id])
					.map((repository) => repository.id),
				workspaceId: workspace.id,
			})
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error)
		}
	}

	async function setColumnsVisible(ids: string[], visible: boolean) {
		table.setColumnVisibility((previous) => ({
			...previous,
			...Object.fromEntries(ids.map((id) => [id, visible])),
		}))
		await tick()
		if (visible) {
			fitColumns(ids.filter((id) => !resizedColumns.has(id)))
		}

		scheduleMetadata()
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

			refreshOutputSorting(run.id)

			if (run.finished) {
				clearPreviousOutputs()
				if (!resizedColumns.has(run.id)) {
					void sizeRunColumn(run.id)
				}
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
				sourceRunIds: runs.map((run) => run.id),
				workspaceId: workspace.id,
			})
			runs = [...runs, run]
			if (commandHistory.at(-1) !== run.command) {
				commandHistory = [...commandHistory, run.command].slice(-100)
			}

			commandForm.resetRecall()
			if (previousRunId !== undefined) {
				autoClearPredecessors.set(run.id, previousRunId)
			}

			clearPreviousOutputs()
			watchRuns()
			await sizeRunColumn(run.id, true)
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error)
		} finally {
			starting = false
		}
	}

	function previewColumn(columnId: string) {
		return getColumnPreviewTooltip(previewRepository, columnId, runs)
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
			table.setSorting((previous) => previous.filter((entry) => entry.id !== runId))
			runs = runs.filter((run) => run.id !== runId)
			rowFilter.prune()
			resizedColumns.delete(runId)
			autoClearPredecessors.delete(runId)
			postWindowMessage({ runId, type: 'run-removed' })
			appWindows.closeOutput(runId)

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

	function clearFinishedRuns() {
		for (const run of runs) {
			if (run.finished) {
				void removeRun(run.id)
			}
		}
	}

	async function resetColumnDefaults() {
		table.resetColumnVisibility()
		await tick()
		fitColumns(
			table
				.getVisibleLeafColumns()
				.filter((column) => !resizedColumns.has(column.id))
				.map((column) => column.id),
		)
		scheduleMetadata()
	}

	function optionalColumnIds() {
		return table
			.getAllLeafColumns()
			.filter((column) => column.getCanHide())
			.map((column) => column.id)
	}

	async function openSelected(target: OpenTarget) {
		for (const row of targets) {
			if (target === 'github' || target === 'vscode') {
				openRepositoryLink(row.original, target)
			} else {
				await openInApp(row.original, target)
			}
		}
	}

	function startResize(
		event: MouseEvent | TouchEvent,
		header: Parameters<typeof startColumnResize>[1],
		pinned: boolean,
	) {
		resizedColumns.add(header.column.id)
		startColumnResize(event, header, pinned, (size) => {
			table.setColumnSizing((previous) => ({ ...previous, [header.column.id]: size }))
		})
	}

	function startDrag(event: PointerEvent, columnId: string) {
		if (
			!(event.target instanceof Element) ||
			!event.target.closest('.resize-handle, .run-actions')
		) {
			startColumnDrag(event, {
				columns: () => table.getVisibleLeafColumns(),
				id: columnId,
				onDragging(id) {
					draggingColumnId = id
				},
				onReorder(order) {
					columnOrder = order
				},
				order: () => resolvedColumnOrder,
				pinned: () => pinnedColumns,
				scroller: tableScroll,
			})
		}
	}

	function showError(error: unknown) {
		errorMessage = error instanceof Error ? error.message : String(error)
	}

	function resetFromWindow(clearHistory: boolean) {
		if (clearHistory) {
			commandHistory = []
		}

		void resetView()
	}

	function inspect(run: CommandRun, repository: Repository) {
		void appWindows.open({
			kind: 'output',
			name: repository.name,
			path: repository.path,
			repositoryId: repository.id,
			runId: run.id,
		})
	}

	async function openInApp(repository: Repository, app: 'finder' | 'terminal' | 'tower') {
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

	const menuActions: MenuActions = {
		'command.focus'() {
			commandForm.focus()
		},
		'command.preset'(payload) {
			if (payload !== undefined) {
				void commandForm.choose(payload)
			}
		},
		'command.run'() {
			void runCommand()
		},
		'command.stopAll'() {
			for (const run of activeRuns) {
				void stop(run.id)
			}
		},
		'edit.selectAll': selection.selectAll,
		'metadata.checkDependencies'() {
			void refreshMetadata(['updates'])
		},
		'metadata.refresh'() {
			void refreshMetadata(['local', 'git', 'github', 'registry', 'ci', 'code', 'files'])
		},
		'preferences.open'() {
			void appWindows.open({ kind: 'preferences' })
		},
		'repositories.deselectAll': selection.clear,
		'repositories.open'(payload) {
			if (isOpenTarget(payload)) {
				void openSelected(payload)
			}
		},
		'repositories.selectAll'() {
			selection.setAll(true)
		},
		'repositories.selectChanged'() {
			selection.set(
				visibleRepositories
					.filter((row) => row.original.gitStatusAvailable && row.original.changedFiles > 0)
					.map((row) => row.id),
				true,
			)
		},
		'runs.clearFinished': clearFinishedRuns,
		'runs.toggleAutoClear'() {
			autoClear = !autoClear
		},
		'view.clearFilter'() {
			rowFilter.set(emptyFilter())
		},
		'view.columns'(payload) {
			if (payload === 'defaults') {
				void resetColumnDefaults()
			} else if (isColumnPreset(payload)) {
				void setColumnsVisible(optionalColumnIds(), payload === 'all')
			}
		},
		'view.filterPreset'(payload) {
			if (isFilterPresetId(payload)) {
				rowFilter.togglePreset(payload)
			}
		},
		'view.fitColumns'() {
			resizedColumns.clear()
			fitColumns()
		},
		'view.focusFilter'() {
			filterInput?.focus()
			filterInput?.select()
		},
		'view.reset'() {
			void resetView()
		},
		'view.toggleFilter': rowFilter.toggle,
		'view.toggleSelectedOnly'() {
			selectedOnly = !selectedOnly
			scheduleMetadata()
		},
		'workspace.browse'() {
			void browseDirectory()
		},
		'workspace.reload'() {
			void loadDirectory()
		},
	}
</script>

<svelte:window onkeydown={data.isElectron ? undefined : selection.shortcut} />

<svelte:head>
	<title>AllWork</title>
	<meta
		name="description"
		content="Discover Git repositories, select a working set, and run shell commands in parallel."
	/>
</svelte:head>

<ElectronMenu
	actions={menuActions}
	state={{
		autoClear,
		canReload: directory.trim() !== '' && !loading && activeRuns.length === 0,
		canRun:
			workspace !== undefined &&
			!starting &&
			!loading &&
			targets.length > 0 &&
			command.trim() !== '',
		filterActive: rowFilter.activeRules > 0,
		filterPreset: rowFilter.preset,
		filterShown: rowFilter.shown,
		hasActiveRuns: activeRuns.length > 0,
		hasFinishedRuns: runs.some((run) => run.finished),
		loading,
		selectedCount: targets.length,
		selectedOnly,
		visibleCount: visibleRepositories.length,
	}}
/>

<AppWindows
	bind:this={appWindows}
	isElectron={data.isElectron}
	onError={showError}
	onPreferences={(next: Preferences) => {
		void applyPreferences(next)
	}}
	onResetView={resetFromWindow}
/>

<ViewPersistence
	bind:this={persistence}
	defaultDirectory={data.defaultDirectory}
	onError={(message: string) => {
		errorMessage = message
	}}
	onRestore={restoreView}
	snapshot={viewSnapshot}
/>

<div class="app-shell">
	<header class="app-toolbar">
		<div class="workspace-tools">
			{#if !data.isElectron}<AppTitle
					onPreferences={async () => appWindows.open({ kind: 'preferences' })}
				/>{/if}
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
					<span>Recursive</span>
				</label>
				{#if typeof window !== 'undefined' && globalThis._allwork !== undefined}<button
						class="button subtle"
						disabled={loading || activeRuns.length > 0}
						onclick={async () => browseDirectory()}
						type="button">Browse…</button
					>{/if}
				<button
					class="button subtle workspace-load-button"
					disabled={directory.trim() === '' || loading || activeRuns.length > 0}
					type="submit"
					>{loading ? 'Scanning…' : workspace === undefined ? 'Load' : 'Reload ↻'}</button
				>
			</form>
		</div>
		<CommandForm
			bind:this={commandForm}
			history={commandHistory}
			{loading}
			onRun={runCommand}
			{starting}
			targetCount={targets.length}
			variables={columnVariables.map((variable) => ({
				...variable,
				preview: previewColumn(variable.id),
			}))}
			bind:command
			bind:concurrency
		/>
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
						<svg aria-hidden="true" fill="none" height="12" viewBox="0 0 16 16" width="12"
							><circle cx="6.5" cy="6.5" r="4" stroke="currentColor" stroke-width="1.5" /><path
								d="m9.5 9.5 4 4"
								stroke="currentColor"
								stroke-width="1.5"
							/></svg
						><input
							bind:this={filterInput}
							aria-label="Filter repositories"
							oninput={() => {
								refreshTableData()
								table.setGlobalFilter(search)
								scheduleMetadata()
							}}
							placeholder="Filter repositories…"
							bind:value={search}
						/>
					</div>
					<button
						class="button subtle filter-toggle"
						class:filtering={rowFilter.activeRules > 0}
						aria-pressed={rowFilter.shown}
						onclick={rowFilter.toggle}
						title={rowFilter.shown ? 'Hide filter rules' : 'Show filter rules'}
						type="button"
						>Filter{rowFilter.activeRules > 0 ? ` (${rowFilter.activeRules})` : ''}</button
					><label class="selected-filter"
						><input onchange={scheduleMetadata} type="checkbox" bind:checked={selectedOnly} /> Selected
						only</label
					>
				</div>
				<div class="selection-tools">
					<label
						class="auto-clear-option"
						title="Delete the preceding output column when this run finishes. Active commands finish before their output is cleared."
					>
						<input aria-label="Auto clear" type="checkbox" bind:checked={autoClear} />
						Auto clear
					</label>
					<div class="output-lines-control">
						<label for="output-lines">Output lines</label>
						<NumberField
							id="output-lines"
							label="Output lines"
							onChange={(value: number) => {
								outputLines = value
							}}
							value={outputLines}
						/>
					</div>
				</div>
				<div class="table-title-actions">
					{#if activeRuns.length > 0}<span class="running-indicator"
							><span class="connection-dot"></span>{activeRuns.length} running</span
						>{/if}{#if runs.some((run) => run.finished)}<button
							class="button subtle"
							onclick={clearFinishedRuns}
							type="button">Clear finished runs</button
						>{/if}
					<MetadataControls
						columns={table
							.getAllFlatColumns()
							.filter((column) => column.getCanHide())
							.map((column) => {
								const definition = repositoryColumns.find((entry) => entry.id === column.id)
								return {
									category: definition?.category ?? 'Runs',
									header: String(column.columnDef.header),
									id: column.id,
									note: definition?.note,
									onDemand: definition?.group === 'updates',
									visible: column.getIsVisible(),
								}
							})}
						disabled={loading || selectedCount === 0}
						onRefresh={refreshMetadata}
						onVisibility={async (id: string, visible: boolean) => setColumnsVisible([id], visible)}
						onVisibilityAll={async (visible: boolean) =>
							setColumnsVisible(optionalColumnIds(), visible)}
						onVisibilityDefaults={resetColumnDefaults}
						onVisibilityMany={setColumnsVisible}
						{selectedCount}
					/>
				</div>
			</div>
			{#if rowFilter.shown}<FilterBar
					columns={rowFilter.columns}
					filter={rowFilter.filter}
					onChange={rowFilter.set}
					onPreset={rowFilter.applyPreset}
					repositories={workspace?.repositories ?? []}
					{runs}
					undecided={rowFilter.undecided}
				/>{/if}
			<div
				bind:this={tableScroll}
				class="table-scroll"
				aria-label="Repository table"
				onpointerdown={() => {
					pendingScroll = undefined
				}}
				onscroll={() => {
					scheduleMetadata()
					scrollPosition = {
						left: Math.round(tableScroll.scrollLeft),
						top: Math.round(tableScroll.scrollTop),
					}
				}}
				onwheel={() => {
					pendingScroll = undefined
				}}
				role="region"
			>
				<table style:width="max(100%, {table.getTotalSize()}px)">
					<colgroup>
						{#each table.getVisibleLeafColumns() as column (column.id)}
							<col style:width="{column.getSize()}px" />
						{/each}
						<col />
					</colgroup>
					<thead
						>{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}<tr
								>{#each headerGroup.headers as header (header.id)}{@const run = runs.find(
										(item) => item.id === header.column.id,
									)}{@const pinned = run !== undefined && run === runs.at(-1)}<th
										style:width="{header.getSize()}px"
										class:column-dragged={draggingColumnId === header.column.id}
										class:last-output-cell={pinned}
										class:numeric-cell={getColumnDisplay(header.column.id) === 'number'}
										class:output-header={run !== undefined}
										class:repository-cell={header.column.id === 'relativePath'}
										class:selection-cell={header.column.id === 'select'}
										aria-sort={header.column.getIsSorted() === 'asc'
											? 'ascending'
											: header.column.getIsSorted() === 'desc'
												? 'descending'
												: undefined}
										data-column-id={header.column.id}
										onpointerdown={(event) => {
											startDrag(event, header.column.id)
										}}
										title={previewColumn(header.column.id)}
									>
										{#if header.column.id === 'select'}<label class="selection-hit-area"
												><input
													aria-label="Select all matching repositories"
													checked={visibleRepositories.length > 0 &&
														targets.length === visibleRepositories.length}
													disabled={visibleRepositories.length === 0}
													indeterminate={targets.length > 0 &&
														targets.length < visibleRepositories.length}
													onchange={() => {
														selection.setAll(targets.length < visibleRepositories.length)
													}}
													type="checkbox"
												/></label
											>
										{:else if run !== undefined}<div class="run-header">
												<button
													class="sort-button run-sort-button"
													aria-label="Sort output for {run.command}"
													onclick={(event) => sortOutput(run.id, event.shiftKey)}
													type="button"
												>
													<span class="run-header-content">
														<span class="run-label"
															>RUN {runs.indexOf(run) + 1}
															<span
																>{runProgress(run)}{run.finished ? ' complete' : ' running'}</span
															></span
														><code title={previewColumn(run.id)}>$ {run.command}</code>
													</span>
													{#if header.column.getIsSorted() !== false}<span
															class="sort-indicator"
															class:descending={header.column.getIsSorted() === 'desc'}
															aria-hidden="true"
														></span>{/if}
												</button>
												<div class="run-actions">
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
												onclick={(event) => {
													refreshTableData()
													header.column.toggleSorting(undefined, event.shiftKey)
													scheduleMetadata()
												}}
												type="button"
												>{String(
													header.column.columnDef.header,
												)}{#if header.column.getIsSorted() !== false}<span
														class="sort-indicator"
														class:descending={header.column.getIsSorted() === 'desc'}
														aria-hidden="true"
													></span>{/if}</button
											>{/if}
										{#if header.column.getCanResize()}<button
												class="resize-handle"
												aria-label="Resize column"
												ondblclick={() => {
													resizedColumns.delete(header.column.id)
													fitColumns([header.column.id], { automatic: false })
												}}
												onmousedown={(event) => startResize(event, header, pinned)}
												ontouchstart={(event) => startResize(event, header, pinned)}
												type="button"
											></button>{/if}
									</th>{/each}<th class="table-filler" aria-hidden="true"></th></tr
							>{/each}</thead
					>
					<tbody
						>{#each table.getRowModel().rows as row (row.id)}<tr
								class:selected={row.getIsSelected()}
								data-repository-id={row.id}
								>{#each row.getVisibleCells() as cell (cell.id)}{@const repository =
										row.original}{@const run = runs.find(
										(item) => item.id === cell.column.id,
									)}{@const tooltip = getColumnTooltip(repository, cell.column.id)}{@const display =
										getColumnDisplay(cell.column.id)}<td
										style:width="{cell.column.getSize()}px"
										class:column-dragged={draggingColumnId === cell.column.id}
										class:last-output-cell={run !== undefined && run === runs.at(-1)}
										class:numeric-cell={display === 'number'}
										class:output-cell={run !== undefined}
										class:repository-cell={cell.column.id === 'relativePath'}
										class:selection-cell={cell.column.id === 'select'}
										data-column-id={cell.column.id}
										title={tooltip}
									>
										{#if cell.column.id === 'select'}<label
												class="selection-hit-area"
												{@attach selection.checkbox(row.id)}
												><input
													aria-label="Select {repository.name}"
													checked={row.getIsSelected()}
													type="checkbox"
												/></label
											>
										{:else}<CellContent
												columnId={cell.column.id}
												onInspect={inspect}
												onOpen={openInApp}
												{outputLines}
												{repository}
												{runs}
												{tooltip}
											/>{/if}
									</td>{/each}<td class="table-filler" aria-hidden="true"></td></tr
							>{/each}</tbody
					>
				</table>
				{#if table.getRowModel().rows.length === 0}<div class="empty-state">
						<h3>
							{loading
								? 'Scanning repositories…'
								: workspace === undefined
									? 'No workspace loaded'
									: workspace.repositories.length === 0
										? 'No Git repositories found'
										: 'No matching repositories'}
						</h3>
						<p>
							{loading
								? 'Reading local Git status and project metadata…'
								: workspace === undefined
									? 'Choose a workspace folder above.'
									: workspace.repositories.length === 0
										? 'Try a folder that contains Git repositories or worktrees.'
										: 'Adjust your filters or turn off “Selected only” to see more projects.'}
						</p>
					</div>{/if}
			</div>
			<footer class="table-footer">
				<span class="selection-count" aria-live="polite"
					>{selectedCount} selected{selectedCount > targets.length
						? ` · ${selectedCount - targets.length} hidden`
						: ''}</span
				>
				<span
					>{visibleRepositories.length} of {workspace?.repositories.length ?? 0} repositories
					<span class="caption-divider">·</span>
					{dirtyCount} with changes <span class="caption-divider">·</span>
					{runs.length} command {runs.length === 1 ? 'run' : 'runs'}</span
				>
				<MetadataProgress
					repositories={workspace?.repositories ?? []}
					workspaceId={workspace?.id ?? ''}
				/>
			</footer>
		</section>
	</main>
</div>
