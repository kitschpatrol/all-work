import type { CommandRun, Repository } from './workspace.js'

export const repositoryColumns = [
	{
		header: 'Repository',
		id: 'relativePath',
		value: (repository: Repository) => repository.relativePath,
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

const spacesPattern = /\s+/gv

/**
 * List the shell variables for repository columns and the current output
 * columns.
 */
export function getColumnVariables(runs: ReadonlyArray<Pick<CommandRun, 'command' | 'id'>> = []) {
	return [
		...repositoryColumns.map(({ header, id }) => ({
			id,
			label: header,
			name: `ALLWORK_COLUMN_${header.toUpperCase().replaceAll(spacesPattern, '_')}`,
		})),
		...runs.map((run, index) => ({
			id: run.id,
			label: `Run ${index + 1}: ${run.command}`,
			name: `ALLWORK_COLUMN_RUN_${index + 1}`,
		})),
	]
}

/** Snapshot one row's raw column values as environment variables. */
export function getColumnEnvironment(repository: Repository, runs: readonly CommandRun[] = []) {
	const values = new Map<string, string>([
		...repositoryColumns.map(({ id, value }): [string, string] => [id, String(value(repository))]),
		...runs.map((run): [string, string] => [run.id, run.results[repository.id]?.output ?? '']),
	])
	return Object.fromEntries(
		getColumnVariables(runs).map(({ id, name }) => [name, values.get(id) ?? '']),
	)
}
