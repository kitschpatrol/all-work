import type { ColumnDef } from '@tanstack/svelte-table'
import {
	columnFilteringFeature,
	columnOrderingFeature,
	columnResizingFeature,
	columnSizingFeature,
	columnVisibilityFeature,
	createFilteredRowModel,
	createSortedRowModel,
	filterFn_includesString,
	globalFilteringFeature,
	rowSelectionFeature,
	rowSortingFeature,
	sortFn_alphanumeric,
	sortFn_basic,
	sortFn_text,
	tableFeatures,
} from '@tanstack/svelte-table'
import type { CommandRun, Repository } from './workspace.js'
import { repositoryColumns } from './column-variables.js'

/** The table features the repository table uses. */
export const features = tableFeatures({
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

export type TableColumn = ColumnDef<typeof features, Repository>

type RunSorting = {
	/** Whether a run's column sorts by exit code rather than output. */
	sortsByExitCode: (runId: string) => boolean
	/** The value a run's column sorts by for a repository. */
	value: (run: CommandRun, repositoryId: string) => number | string | undefined
}

/**
 * Define the table's columns: the selection checkbox, the repository columns,
 * and a column of output for each command run.
 */
export function createColumnDefs(
	runs: readonly CommandRun[],
	runSorting: RunSorting,
): TableColumn[] {
	return [
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
		...repositoryColumns.map((column): TableColumn => ({
			accessorFn: column.value,
			enableHiding: column.id !== 'relativePath',
			header: column.header,
			id: column.id,
			minSize: column.id === 'relativePath' ? 160 : 24,
			sortFn: column.sort,
			sortUndefined: 'last',
		})),
		...runs.map((run): TableColumn => ({
			accessorFn: (repository: Repository) => runSorting.value(run, repository.id),
			enableGlobalFilter: false,
			header: run.command,
			id: run.id,
			minSize: 240,
			size: 240,
			sortFn: (rowA, rowB, columnId) =>
				(runSorting.sortsByExitCode(run.id) ? sortFn_basic : sortFn_text)(rowA, rowB, columnId),
			// Rows without an exit code stay last in either direction
			sortUndefined: 'last',
		})),
	]
}
