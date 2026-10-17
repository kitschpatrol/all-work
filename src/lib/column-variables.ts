/* eslint-disable ts/naming-convention -- Frontmatter keys preserve the Metascope template spelling. */
import type { ColumnDisplay, ColumnKind } from './metadata-columns.js'
import type { CommandRun, MetadataGroup, Repository } from './workspace.js'
import { metadataColumns, metadataHint, metadataText } from './metadata-columns.js'

type RepositoryColumn = {
	category: string
	display: ColumnDisplay
	field?: string
	group: MetadataGroup
	header: string
	id: string
	kind: ColumnKind
	note?: string
	sort: 'alphanumeric' | 'basic'
	value: (repository: Repository) => boolean | number | string | undefined
	visible: boolean
}

const existingColumns = [
	{
		header: 'Repository',
		id: 'relativePath',
		value: (repository: Repository) => repository.relativePath,
	},
	{ header: 'Repo name', id: 'repoName', value: (repository: Repository) => repository.repoName },
	{
		header: 'Repo owner',
		id: 'repoOwner',
		value: (repository: Repository) => repository.repoOwner,
	},
	{ header: 'Name', id: 'name', value: (repository: Repository) => repository.name },
	{
		header: 'Description',
		id: 'description',
		value: (repository: Repository) => repository.description,
	},
	{ header: 'Branch', id: 'branch', value: (repository: Repository) => repository.branch },
	{
		header: 'Working tree',
		id: 'changedFiles',
		value: (repository: Repository) =>
			repository.gitStatusAvailable ? repository.changedFiles : '',
	},
	{
		header: 'Sync',
		id: 'sync',
		value: (repository: Repository) =>
			repository.gitStatusAvailable ? repository.ahead + repository.behind : '',
	},
	{
		header: 'Last commit',
		id: 'lastCommitDate',
		value: (repository: Repository) => repository.lastCommitDate,
	},
	{ header: 'Version', id: 'version', value: (repository: Repository) => repository.version },
	{
		header: 'Package manager',
		id: 'packageManager',
		value: (repository: Repository) => repository.packageManager,
	},
	{ header: 'Remote', id: 'remote', value: (repository: Repository) => repository.remote },
] as const

const representedFields: Record<string, string> = {
	Description: 'description',
	'Git Current Branch': 'branch',
	'Git Dirty Files': 'changedFiles',
	'Latest Commit Date': 'lastCommitDate',
	Name: 'name',
	Version: 'version',
}

export const repositoryColumns: RepositoryColumn[] = [
	...existingColumns.map((column): RepositoryColumn => ({
		...column,
		category: ['branch', 'changedFiles', 'lastCommitDate', 'sync'].includes(column.id)
			? 'Git'
			: 'Identity',
		display:
			column.id === 'sync'
				? 'number'
				: ['packageManager', 'remote', 'version'].includes(column.id)
					? 'code'
					: 'text',
		field: Object.entries(representedFields).find(([, id]) => id === column.id)?.[0],
		group: ['branch', 'changedFiles', 'lastCommitDate', 'sync'].includes(column.id)
			? 'git'
			: 'local',
		kind: ['changedFiles', 'sync'].includes(column.id)
			? 'number'
			: column.id === 'lastCommitDate'
				? 'date'
				: 'text',
		sort: 'alphanumeric',
		visible: !['packageManager', 'remote', 'sync'].includes(column.id),
	})),
	...metadataColumns
		.filter(({ field }) => representedFields[field] === undefined)
		.map((column): RepositoryColumn => ({
			...column,
			header:
				column.field === 'Git Remotes Ahead'
					? 'Ahead'
					: column.field === 'Git Remotes Behind'
						? 'Behind'
						: column.field,
			id: `metadata:${column.field}`,
			value(repository) {
				const value = repository.metadata?.values[column.field]
				return Array.isArray(value) ? metadataText(value) : value
			},
			visible:
				column.visible === true ||
				['Git Remotes Ahead', 'Git Remotes Behind'].includes(column.field),
		})),
]

const spacesPattern = /\s+/gv
const wordStartPattern = /(?<!\p{L})\p{Ll}/gv
// Metascope reports authorship status as lowercase keywords
const titleCasedColumns = new Set(['metadata:Status'])
const commandVariablePattern = /\$\{?(ALLWORK_COLUMN_\w+)/gv
const columnsById = new Map(repositoryColumns.map((column) => [column.id, column]))
const repositoryVariables = new Map(
	repositoryColumns.map(({ category, header, id }) => [
		id,
		{
			category,
			id,
			label: header,
			name: `ALLWORK_COLUMN_${header.toUpperCase().replaceAll(spacesPattern, '_')}`,
		},
	]),
)

/**
 * List the shell variables for repository columns and the current output
 * columns.
 */
export function getColumnVariables(runs: ReadonlyArray<Pick<CommandRun, 'command' | 'id'>> = []) {
	return [...repositoryVariables.values(), ...runs.map((run, index) => runVariable(run, index))]
}

function runVariable(run: Pick<CommandRun, 'command' | 'id'>, index: number) {
	return {
		category: 'Runs',
		id: run.id,
		label: `Run ${index + 1}: ${run.command}`,
		name: `ALLWORK_COLUMN_RUN_${index + 1}`,
	}
}

function findVariable(id: string, runs: readonly CommandRun[]) {
	const variable = repositoryVariables.get(id)
	if (variable !== undefined) {
		return variable
	}

	const index = runs.findIndex((run) => run.id === id)
	const run = runs[index]
	return run === undefined ? undefined : runVariable(run, index)
}

/**
 * Read current row values without retaining a table accessor's older cached
 * value.
 */
function getColumnValue(
	repository: Repository,
	columnId: string,
	runs: readonly CommandRun[] = [],
) {
	const column = columnsById.get(columnId)
	return column === undefined
		? runs.find((run) => run.id === columnId)?.results[repository.id]?.output
		: column.value(repository)
}

/** Snapshot one row's raw column values as environment variables. */
export function getColumnEnvironment(repository: Repository, runs: readonly CommandRun[] = []) {
	const values = new Map<string, string>([
		...repositoryColumns.map(({ id, value }): [string, string] => [
			id,
			String(value(repository) ?? ''),
		]),
		...runs.map((run): [string, string] => [run.id, run.results[repository.id]?.output ?? '']),
	])
	return Object.fromEntries(
		getColumnVariables(runs).map(({ id, name }) => [name, values.get(id) ?? '']),
	)
}

/**
 * Prevent a command from silently receiving empty values while referenced
 * metadata is pending.
 */
export function getPendingCommandColumns(
	command: string,
	repositories: readonly Repository[],
): string[] {
	const variables = getColumnVariables()
	const referenced = new Set(
		Array.from(command.matchAll(commandVariablePattern), (match) => match[1]),
	)
	return repositoryColumns
		.filter((column) => {
			const variable = variables.find((entry) => entry.id === column.id)
			if (variable === undefined || !referenced.has(variable.name)) {
				return false
			}

			return repositories.some((repository) => {
				const value = column.value(repository)
				const state = repository.metadata?.groups[column.group]
				return (
					(value === undefined || value === '') &&
					(state === undefined || state.status === 'queued' || state.status === 'loading')
				)
			})
		})
		.map((column) => column.header)
}

/** Show the exact row value, availability, and field meaning in a hover. */
export function getColumnTooltip(repository: Repository, columnId: string): string {
	const column = columnsById.get(columnId)
	if (column === undefined) {
		return ''
	}

	return [
		String(column.value(repository) ?? ''),
		metadataHint(repository, column.group),
		column.note ?? '',
	]
		.filter(Boolean)
		.join('\n')
}

/** Preview a column and identify its source repository. */
export function getColumnPreviewTooltip(
	repository: Repository | undefined,
	columnId: string,
	runs: readonly CommandRun[] = [],
): string {
	const variable = findVariable(columnId, runs)
	if (variable === undefined) {
		return ''
	}

	if (repository === undefined) {
		return `$${variable.name}`
	}

	const column = columnsById.get(columnId)
	const value = String(getColumnValue(repository, columnId, runs) ?? '')
	return [
		`$${variable.name} = ${value === '' ? '""' : value}`,
		column === undefined ? '' : metadataHint(repository, column.group),
		column?.note ?? '',
		`Repository: ${repository.relativePath}`,
	]
		.filter(Boolean)
		.join('\n')
}

/**
 * How a column's values are set: numbers right-align in monospace, code such as
 * versions and paths is monospace, and everything else, including run output
 * columns, is text.
 */
export function getColumnDisplay(columnId: string): ColumnDisplay {
	return columnsById.get(columnId)?.display ?? 'text'
}

/** Format a current row value for its table cell. */
export function formatColumnCellValue(
	repository: Repository,
	columnId: string,
	runs: readonly CommandRun[] = [],
) {
	const value = getColumnValue(repository, columnId, runs)
	return value === undefined || value === ''
		? getMetadataPlaceholder(repository, columnId)
		: typeof value === 'boolean'
			? value
				? 'Yes'
				: 'No'
			: titleCasedColumns.has(columnId)
				? String(value).replaceAll(wordStartPattern, (letter) => letter.toUpperCase())
				: String(value)
}

/** Describe a missing value without confusing it with zero or false. */
export function getMetadataPlaceholder(repository: Repository, columnId: string) {
	const column = columnsById.get(columnId)
	const state = column === undefined ? undefined : repository.metadata?.groups[column.group]
	return state?.status === 'loading' ||
		state?.status === 'queued' ||
		(state === undefined && column !== undefined && ['code', 'files'].includes(column.group))
		? '…'
		: state === undefined && column?.group === 'updates'
			? 'Not scanned'
			: '—'
}
