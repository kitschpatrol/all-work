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

const upstreamNote =
	'Compared with the upstream branch as last fetched. Empty without an upstream or when its ref is missing locally.'

const upstreamColumns = new Set(['ahead', 'behind', 'sync'])

function describeUpstream(repository: Repository) {
	if (!repository.gitStatusAvailable) {
		return ''
	}

	return repository.upstream === ''
		? 'No upstream branch'
		: repository.upstreamGone
			? `Upstream ${repository.upstream} is missing locally`
			: `Upstream: ${repository.upstream}`
}

function upstreamCount(repository: Repository, count: number) {
	return repository.gitStatusAvailable && repository.upstream !== '' && !repository.upstreamGone
		? count
		: ''
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
		header: 'Ahead',
		id: 'ahead',
		note: upstreamNote,
		value: (repository: Repository) => upstreamCount(repository, repository.ahead),
	},
	{
		header: 'Behind',
		id: 'behind',
		note: upstreamNote,
		value: (repository: Repository) => upstreamCount(repository, repository.behind),
	},
	{
		header: 'Sync',
		id: 'sync',
		note: upstreamNote,
		value: (repository: Repository) =>
			upstreamCount(repository, repository.ahead + repository.behind),
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

const gitColumns = new Set(['ahead', 'behind', 'branch', 'changedFiles', 'lastCommitDate', 'sync'])
const countColumns = new Set(['ahead', 'behind', 'changedFiles', 'sync'])

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
		category: gitColumns.has(column.id) ? 'Git' : 'Identity',
		display: upstreamColumns.has(column.id)
			? 'number'
			: ['packageManager', 'remote', 'version'].includes(column.id)
				? 'code'
				: 'text',
		field: Object.entries(representedFields).find(([, id]) => id === column.id)?.[0],
		group: gitColumns.has(column.id) ? 'git' : 'local',
		kind: countColumns.has(column.id) ? 'number' : column.id === 'lastCommitDate' ? 'date' : 'text',
		sort: 'alphanumeric',
		visible: !['packageManager', 'remote', 'sync'].includes(column.id),
	})),
	...metadataColumns
		.filter(({ field }) => representedFields[field] === undefined)
		.map((column): RepositoryColumn => ({
			...column,
			header: column.field,
			id: `metadata:${column.field}`,
			value(repository) {
				const value = repository.metadata?.values[column.field]
				return Array.isArray(value) ? metadataText(value) : value
			},
			visible: column.visible === true,
		})),
]

const spacesPattern = /\s+/gv
const wordStartPattern = /(?<!\p{L})\p{Ll}/gv
// Metascope reports authorship status as lowercase keywords
const titleCasedColumns = new Set(['metadata:Status'])
const commandVariablePattern = /\$\{?(ALL_WORK_COLUMN_\w+)/gv
const columnsById = new Map(repositoryColumns.map((column) => [column.id, column]))
const repositoryVariables = new Map(
	repositoryColumns.map(({ category, header, id }) => [
		id,
		{
			category,
			id,
			label: header,
			name: `ALL_WORK_COLUMN_${header.toUpperCase().replaceAll(spacesPattern, '_')}`,
		},
	]),
)

/**
 * List the shell variables for repository columns and the current output
 * columns.
 */
export function getColumnVariables(
	runs: ReadonlyArray<Pick<CommandRun, 'command' | 'id' | 'number'>> = [],
) {
	return [...repositoryVariables.values(), ...runs.map((run) => runVariable(run))]
}

function runVariable(run: Pick<CommandRun, 'command' | 'id' | 'number'>) {
	return {
		category: 'Runs',
		id: run.id,
		label: `Run ${run.number}: ${run.command}`,
		name: `ALL_WORK_COLUMN_RUN_${run.number}`,
	}
}

function findVariable(
	id: string,
	runs: ReadonlyArray<Pick<CommandRun, 'command' | 'id' | 'number'>>,
) {
	const variable = repositoryVariables.get(id)
	if (variable !== undefined) {
		return variable
	}

	const run = runs.find((entry) => entry.id === id)
	return run === undefined ? undefined : runVariable(run)
}

/**
 * Describe a column for the menus that show and hide it. Command run columns
 * share the Runs category.
 */
export function describeOptionalColumn(id: string, header: string, visible: boolean) {
	const column = columnsById.get(id)
	return {
		category: column?.category ?? 'Runs',
		header,
		id,
		note: column?.note,
		onDemand: column?.group === 'updates',
		visible,
	}
}

/**
 * Read current row values without retaining a table accessor's older cached
 * value.
 */
export function getColumnValue(
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
		upstreamColumns.has(columnId) ? describeUpstream(repository) : '',
		column.note ?? '',
	]
		.filter(Boolean)
		.join('\n')
}

/**
 * Describe a table cell on hover: the column's tooltip, then the repository's
 * path, description, or latest commit subject for the columns that show them.
 */
export function getCellTooltip(repository: Repository, columnId: string): string {
	const detail =
		columnId === 'relativePath'
			? repository.path
			: columnId === 'name'
				? repository.description
				: columnId === 'lastCommitDate'
					? repository.lastCommit
					: ''
	return [getColumnTooltip(repository, columnId), detail].filter(Boolean).join('\n')
}

/**
 * The shell variable name, such as `ALL_WORK_COLUMN_BRANCH`, for a repository
 * or run column.
 */
export function getColumnVariableName(
	columnId: string,
	runs: ReadonlyArray<Pick<CommandRun, 'command' | 'id' | 'number'>> = [],
): string | undefined {
	return findVariable(columnId, runs)?.name
}

function previewLines(
	repository: Repository,
	columnId: string,
	runs: readonly CommandRun[],
	label: (value: string) => string,
) {
	const column = columnsById.get(columnId)
	return [
		label(String(getColumnValue(repository, columnId, runs) ?? '')),
		column === undefined ? '' : metadataHint(repository, column.group),
		column?.note ?? '',
		`Repository: ${repository.relativePath}`,
	]
		.filter(Boolean)
		.join('\n')
}

/**
 * Preview a column header with one repository's value, availability, and
 * meaning.
 */
export function getColumnPreviewTooltip(
	repository: Repository | undefined,
	columnId: string,
	runs: readonly CommandRun[] = [],
): string {
	return repository === undefined || findVariable(columnId, runs) === undefined
		? ''
		: previewLines(repository, columnId, runs, (value) => value)
}

/**
 * Preview the shell variable a column provides and the value a command
 * receives.
 */
export function getVariablePreviewTooltip(
	repository: Repository | undefined,
	columnId: string,
	runs: readonly CommandRun[] = [],
): string {
	const name = getColumnVariableName(columnId, runs)
	if (name === undefined) {
		return ''
	}

	return repository === undefined
		? `$${name}`
		: previewLines(
				repository,
				columnId,
				runs,
				(value) => `$${name} = ${value === '' ? '""' : value}`,
			)
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
