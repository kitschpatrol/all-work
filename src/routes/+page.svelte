<script lang="ts">
	import type { ColumnDef, RowSelectionState } from '@tanstack/svelte-table'
	import type { AppWindow } from '#lib/app-windows.js'
	import type { MenuActions } from '#lib/electron-api.js'
	import type { RequestedMetadata } from '#lib/metadata-requests.js'
	import type { Preferences } from '#lib/preferences.js'
	import type { NativeOpenTarget } from '#lib/repository-links.js'
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
	import { createColumnMenu } from '#lib/column-menu.js'
	import { moveColumnToEnd, resolveColumnOrder } from '#lib/column-order.js'
	import { createColumnPresets } from '#lib/column-preset-state.svelte.js'
	import { defaultColumnPreset, isColumnPresetId } from '#lib/column-presets.js'
	import { startColumnResize } from '#lib/column-resize.js'
	import {
		describeOptionalColumn,
		getCellTooltip,
		getColumnDisplay,
		getColumnPreviewTooltip,
		getColumnVariables,
		getVariablePreviewTooltip,
		repositoryColumns,
	} from '#lib/column-variables.js'
	import CommandForm from '#lib/CommandForm.svelte'
	import { isOpenTarget } from '#lib/electron-api.js'
	import ElectronMenu from '#lib/ElectronMenu.svelte'
	import { isFilterPresetId } from '#lib/filter-presets.js'
	import FilterBar from '#lib/FilterBar.svelte'
	import { titleOnHover } from '#lib/hover-titles.js'
	import { refreshGroups } from '#lib/metadata-columns.js'
	import { planMetadataRequests, sendMetadataRequests } from '#lib/metadata-requests.js'
	import { watchWorkspaceMetadata } from '#lib/metadata-stream.js'
	import MetadataControls from '#lib/MetadataControls.svelte'
	import MetadataProgress from '#lib/MetadataProgress.svelte'
	import { savePreferenceChanges, updatePreferences } from '#lib/preference-actions.js'
	import { defaultPreferences } from '#lib/preferences.js'
	import { openRepositories } from '#lib/repository-links.js'
	import { mergeGroups, mergeRepository } from '#lib/repository-merge.js'
	import { createRowFilter } from '#lib/row-filter-state.svelte.js'
	import { emptyFilter } from '#lib/row-filter.js'
	import { createRowSelection } from '#lib/row-selection.js'
	import { createRunHistory } from '#lib/run-history.svelte.js'
	import RunHeader from '#lib/RunHeader.svelte'
	import { getColumnSizingValue, runCellStatus } from '#lib/table-formatting.js'
	import { createTableRows } from '#lib/table-rows.svelte.js'
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
	let searchInput = $state<HTMLInputElement>()
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
	const requestedMetadata: RequestedMetadata = new SvelteMap()
	const repositoryColumnIds = new SvelteSet(repositoryColumns.map((column) => column.id))
	const autoClearPredecessors = new SvelteMap<string, string>()
	const resizedColumns = new SvelteSet<string>()
	// Metadata groups that load for shown columns, rows in view first; codebase scans and dependency checks run only when requested
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
	const defaultColumnIds = new Set(['relativePath', ...defaultColumnPreset.columns])

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
		clearedRuns: () => runHistory.cleared,
		onChange() {
			scheduleMetadata()
			void runHistory.release().catch(showError)
		},
		async onPresetsChange(presets) {
			preferences = await savePreferenceChanges(preferences, { filterPresets: presets })
		},
		presets: () => preferences.filterPresets,
		repositories: () => workspace?.repositories ?? [],
		runs: () => runs,
	})
	const runHistory = createRunHistory((runId) => rowFilter.references(runId))
	const tableRows = createTableRows({
		matches: () => rowFilter.matches,
		// Filter rules, search, and sorting by anything but the path read row values
		readsValues: () =>
			search !== '' ||
			rowFilter.activeRules > 0 ||
			table.atoms.sorting.get().some((entry) => entry.id !== 'relativePath'),
		repositories: () => workspace?.repositories ?? [],
		selection: () => (selectedOnly ? rowSelection : undefined),
	})
	const table = createTable({
		columnResizeMode: 'onChange',
		get columns() {
			return columns
		},
		get data() {
			return tableRows.rows
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
	// Columns that can be shown and hidden, in column order
	const optionalColumns = $derived(
		table
			.getAllFlatColumns()
			.filter((column) => column.getCanHide())
			.map((column) =>
				describeOptionalColumn(column.id, String(column.columnDef.header), column.getIsVisible()),
			),
	)
	const optionalColumnIds = $derived(optionalColumns.map((column) => column.id))
	// Optional repository columns; presets leave command run columns alone
	const presetColumnIds = $derived(optionalColumnIds.filter((id) => repositoryColumnIds.has(id)))
	const columnPresets = createColumnPresets({
		apply(changes) {
			void changeVisibility(changes)
		},
		available: () => presetColumnIds,
		async onPresetsChange(presets) {
			preferences = await savePreferenceChanges(preferences, { columnPresets: presets })
		},
		presets: () => preferences.columnPresets,
		visibility: () => table.atoms.columnVisibility.get(),
	})
	const columnMenu = createColumnMenu({
		beforeSort: tableRows.refresh,
		getColumn: (id) => table.getColumn(id),
		getColumnOrder: () => table.getVisibleLeafColumns().map((column) => column.id),
		getOptionalColumns: () => optionalColumns,
		getRows: (selected) => (selected ? targets : visibleRepositories).map((row) => row.original),
		getRuns: () => runs,
		onError: showError,
		onFilter: rowFilter.addColumnRule,
		onHide: async (id) => setColumnsVisible([id], false),
		onRemoveRuns(ids) {
			for (const id of ids) {
				void removeRun(id)
			}
		},
		async onShow(id) {
			columnOrder = moveColumnToEnd(resolvedColumnOrder, id, pinnedColumns)
			await setColumnsVisible([id], true)
			await tick()
			tableScroll.scrollLeft = tableScroll.scrollWidth
		},
		onSort: scheduleMetadata,
		pinned: () => pinnedColumns,
	})
	const visibleRepositories = $derived(table.getRowModel().rows)
	// Spare width opens up before the pinned run column, which keeps it at the table's right edge
	const fillerAfterColumnId = $derived(
		table.getVisibleLeafColumns().findLast((column) => !pinnedColumns.end.includes(column.id))?.id,
	)
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
	const activeRuns = $derived(runs.filter((run) => !run.finished))
	const dirtyCount = $derived(
		workspace?.repositories.filter((repository) => repository.changedFiles > 0).length ?? 0,
	)

	const viewSnapshot = $derived<SavedView>({
		autoClear,
		autoClearPredecessors: Object.fromEntries(autoClearPredecessors),
		clearedRunIds:
			workspace === undefined
				? (savedView?.clearedRunIds ?? [])
				: runHistory.cleared.map((run) => run.id),
		columnOrder,
		columnPreset: columnPresets.selected?.id,
		columnSizing: table.atoms.columnSizing.get(),
		columnVisibility: table.atoms.columnVisibility.get(),
		command,
		commandHistory,
		concurrency,
		directory,
		filter: rowFilter.filter,
		filterOpen: rowFilter.open,
		filterPreset: rowFilter.selectedPreset?.id,
		nextRunNumber:
			workspace === undefined ? (savedView?.nextRunNumber ?? 1) : runHistory.nextNumber,
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
		rowFilter.restore(view.filter, view.filterOpen, view.filterPreset)
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

		columnPresets.restore(view.columnPreset)

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

	async function applyPreferences(next: Preferences, persist = false) {
		try {
			await updatePreferences(preferences, next, workspace, persist)
			preferences = next
		} catch (error) {
			showError(error)
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
		void runHistory.reset(runs).catch(showError)
		selectedOnly = false
		resizedColumns.clear()
		table.resetColumnVisibility()
		columnPresets.restore()
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
		tableRows.dispose()
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

	function sortOutput(runId: string, multiple: boolean) {
		tableRows.refresh()
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
				const restoredRuns = await request<CommandRun[]>('/api/runs/restore', {
					ids: [...restored.runIds, ...restored.clearedRunIds],
					workspaceId: next.id,
				})
				runs = runHistory.restore(restoredRuns, restored.clearedRunIds, restored.nextRunNumber)
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
				rowFilter.clear()
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
			(event) => {
				if (workspace?.id !== workspaceId) {
					return
				}

				if (event.snapshot) {
					workspace.repositories = event.repositories
				} else {
					const rows = new Map(
						workspace.repositories.map((repository) => [repository.id, repository]),
					)
					for (const update of event.repositories) {
						const row = rows.get(update.id)
						if (row !== undefined) {
							mergeRepository(row, update)
						}
					}

					for (const { groups, id } of event.statuses) {
						const row = rows.get(id)
						if (row !== undefined) {
							mergeGroups(row, groups)
						}
					}

					// Loading states alone change no values the filter or sort read
					if (event.repositories.length > 0) {
						tableRows.changed()
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

	function scheduleMetadata() {
		metadataTimer ??= setTimeout(() => {
			metadataTimer = undefined
			void loadMetadata()
		}, 200)
	}

	async function loadMetadata() {
		if (workspace === undefined) {
			return
		}

		const workspaceId = workspace.id
		const visibleIds = getVisibleRepositoryIds(
			tableScroll,
			targets.map((row) => row.id),
		)
		// Rules decide which rows appear, so the groups they read load first for every row
		const filterGroups = rowFilter.groups.filter((group) => lazyGroups.has(group))
		// Background work follows the table order, then reaches rows the filter hides
		const allIds = workspace.repositories.map((repository) => repository.id)
		const orderedIds = [...new Set([...visibleRepositories.map((row) => row.id), ...allIds])]
		const groups = new Set([
			...filterGroups,
			...table
				.getVisibleLeafColumns()
				.map((column) => repositoryColumns.find((entry) => entry.id === column.id)?.group)
				.filter((group): group is MetadataGroup => group !== undefined && lazyGroups.has(group)),
		])
		const batches = planMetadataRequests({
			filterGroups,
			groups,
			orderedIds,
			requested: requestedMetadata,
			visibleIds,
		})
		await sendMetadataRequests(workspaceId, batches, {
			isCurrent: () => workspace?.id === workspaceId,
			onError(error) {
				if (!loading) {
					showError(error)
				}
			},
		})
	}

	async function refreshMetadata(
		groups: MetadataGroup[],
		repositoryIds = targets.map((row) => row.id),
	) {
		if (workspace === undefined || repositoryIds.length === 0) {
			return
		}

		try {
			await request('/api/workspace/metadata', {
				force: true,
				groups,
				repositoryIds,
				workspaceId: workspace.id,
			})
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error)
		}
	}

	async function setColumnsVisible(ids: string[], visible: boolean) {
		columnPresets.edit()
		await changeVisibility(Object.fromEntries(ids.map((id) => [id, visible])))
	}

	// Show and hide columns, fitting the ones that appear
	async function changeVisibility(changes: Record<string, boolean>) {
		const previous = table.atoms.columnVisibility.get()
		table.setColumnVisibility({ ...previous, ...changes })
		await tick()
		fitColumns(
			Object.keys(changes).filter(
				(id) => changes[id] === true && previous[id] === false && !resizedColumns.has(id),
			),
		)
		scheduleMetadata()
	}

	async function browseDirectory() {
		try {
			const chosen = await globalThis._allWork?.chooseDirectory()
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

			tableRows.changed()

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
				number: runHistory.nextNumber,
				repositoryIds: targets.map((row) => row.id),
				sourceRunIds: runs.map((run) => run.id),
				workspaceId: workspace.id,
			})
			runs = [...runs, run]
			runHistory.counted(run)
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

	// Headers preview the first selected or visible repository
	function describeCell(cell: HTMLElement) {
		const columnId = cell.dataset.columnId ?? ''
		const repositoryId = cell.closest<HTMLElement>('tr')?.dataset.repositoryId
		if (repositoryId === undefined) {
			return getColumnPreviewTooltip(previewRepository, columnId, runs)
		}

		const repository = workspace?.repositories.find((entry) => entry.id === repositoryId)
		return repository === undefined ? '' : getCellTooltip(repository, columnId)
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
			await runHistory.clear(runId, runs)
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

	async function openInApp(repository: Repository, app: NativeOpenTarget) {
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
		...columnMenu.actions,
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
			void refreshMetadata(refreshGroups)
		},
		'preferences.open'() {
			void appWindows.open({ kind: 'preferences' })
		},
		'repositories.deselectAll': selection.clear,
		'repositories.open'(payload) {
			if (isOpenTarget(payload)) {
				void openRepositories(
					targets.map((row) => row.original),
					payload,
					openInApp,
				)
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
			rowFilter.clear()
		},
		'view.columnPreset'(payload) {
			if (isColumnPresetId(payload)) {
				columnPresets.applyPreset(payload)
			}
		},
		'view.columns'(payload) {
			if (payload === 'all' || payload === 'none') {
				void setColumnsVisible(optionalColumnIds, payload === 'all')
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
		'view.focusSearch'() {
			searchInput?.focus()
			searchInput?.select()
		},
		'view.reset'() {
			void resetView()
		},
		'view.toggleFilter': rowFilter.toggle,
		'view.toggleRepositoryShortcuts'() {
			void applyPreferences(
				{ ...preferences, showRepositoryShortcuts: !preferences.showRepositoryShortcuts },
				true,
			)
		},
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
	<title>All Work</title>
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
		columnPreset: columnPresets.matched,
		columnPresets: columnPresets.presets.map(({ id, label }) => ({ id, label })),
		filterActive: rowFilter.activeRules > 0,
		filterPreset: rowFilter.preset,
		filterPresets: rowFilter.presets.map(({ id, label }) => ({ id, label })),
		filterShown: rowFilter.open,
		hasActiveRuns: activeRuns.length > 0,
		hasFinishedRuns: runs.some((run) => run.finished),
		loading,
		selectedCount: targets.length,
		selectedOnly,
		showRepositoryShortcuts: preferences.showRepositoryShortcuts,
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
	rows={visibleRepositories.map((row) => row.original)}
	{runs}
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
				<div class="toolbar-row">
					<input
						id="workspace-directory"
						class="directory-input"
						aria-label="Workspace directory"
						disabled={loading || activeRuns.length > 0}
						placeholder="/path/to/your/projects"
						bind:value={directory}
					/>
					{#if typeof window !== 'undefined' && globalThis._allWork !== undefined}<button
							class="button subtle"
							disabled={loading || activeRuns.length > 0}
							onclick={async () => browseDirectory()}
							type="button">Browse…</button
						>{/if}
				</div>
				<div class="toolbar-row">
					<button
						class="button subtle workspace-load-button"
						disabled={directory.trim() === '' || loading || activeRuns.length > 0}
						type="submit"
						>{loading ? 'Scanning…' : workspace === undefined ? 'Load' : 'Reload ↻'}</button
					>
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
				</div>
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
				preview: getVariablePreviewTooltip(previewRepository, variable.id, runs),
			}))}
			bind:autoClear
			bind:command
			bind:concurrency
			bind:outputLines
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
							bind:this={searchInput}
							aria-label="Search repositories"
							oninput={() => {
								tableRows.refresh()
								table.setGlobalFilter(search)
								scheduleMetadata()
							}}
							placeholder="Search repositories…"
							type="search"
							bind:value={search}
						/>
					</div>
					<label class="selected-filter"
						><input onchange={scheduleMetadata} type="checkbox" bind:checked={selectedOnly} /> Selected
						only</label
					>
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
						{columnPresets}
						columns={optionalColumns}
						disabled={loading || targets.length === 0}
						onRefresh={refreshMetadata}
						onVisibility={async (id: string, visible: boolean) => setColumnsVisible([id], visible)}
						onVisibilityAll={async (visible: boolean) =>
							setColumnsVisible(optionalColumnIds, visible)}
						onVisibilityMany={setColumnsVisible}
						selectedCount={targets.length}
					/>
				</div>
			</div>
			<FilterBar
				repositories={workspace?.repositories ?? []}
				{rowFilter}
				{runs}
				visibleCount={visibleRepositories.length}
			/>
			<div
				bind:this={tableScroll}
				class="table-scroll"
				{@attach titleOnHover(describeCell)}
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
							{#if column.id === fillerAfterColumnId}<col />{/if}
						{/each}
					</colgroup>
					<thead
						>{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}<tr
								>{#each headerGroup.headers as header (header.id)}{@const run = runs.find(
										(item) => item.id === header.column.id,
									)}{@const pinned = run !== undefined && run === runs.at(-1)}<th
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
										oncontextmenu={async (event) => columnMenu.show(event, header.column.id)}
										onpointerdown={(event) => {
											startDrag(event, header.column.id)
										}}
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
										{:else if run !== undefined}<RunHeader
												number={run.number}
												onRemove={async () => removeRun(run.id)}
												onSort={(multiple: boolean) => {
													sortOutput(run.id, multiple)
												}}
												onStop={async () => stop(run.id)}
												{run}
												sorted={header.column.getIsSorted()}
											/>
										{:else}<button
												class="sort-button"
												disabled={!header.column.getCanSort()}
												onclick={(event) => {
													tableRows.refresh()
													header.column.toggleSorting(undefined, event.shiftKey)
													scheduleMetadata()
												}}
												type="button"
												><span class="header-label">{String(header.column.columnDef.header)}</span
												>{#if header.column.getIsSorted() !== false}<span
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
									</th>{#if header.column.id === fillerAfterColumnId}<th
											class="table-filler"
											aria-hidden="true"
											oncontextmenu={async (event) => columnMenu.showHidden(event)}
										></th>{/if}{/each}</tr
							>{/each}</thead
					>
					<tbody
						>{#each table.getRowModel().rows as row (row.id)}<tr
								class:selected={row.getIsSelected()}
								data-repository-id={row.id}
								>{#each row.getVisibleCells() as cell (cell.id)}{@const repository =
										row.original}{@const run = runs.find(
										(item) => item.id === cell.column.id,
									)}{@const display = getColumnDisplay(cell.column.id)}<td
										class:column-dragged={draggingColumnId === cell.column.id}
										class:last-output-cell={run !== undefined && run === runs.at(-1)}
										class:numeric-cell={display === 'number'}
										class:output-cell={run !== undefined}
										class:repository-cell={cell.column.id === 'relativePath'}
										class:selection-cell={cell.column.id === 'select'}
										data-column-id={cell.column.id}
										data-run-status={run === undefined
											? undefined
											: runCellStatus(run, repository.id)}
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
												onRefresh={async (target: Repository) =>
													refreshMetadata(refreshGroups, [target.id])}
												{outputLines}
												{repository}
												{runs}
												showShortcuts={preferences.showRepositoryShortcuts}
											/>{/if}
									</td>{#if cell.column.id === fillerAfterColumnId}<td
											class="table-filler"
											aria-hidden="true"
										></td>{/if}{/each}</tr
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
				<span class="selection-count" aria-live="polite">{targets.length} selected</span>
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
