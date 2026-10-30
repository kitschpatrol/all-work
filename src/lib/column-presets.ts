import { asRecord } from './record.js'

const presetIds = [
	'adoption',
	'all',
	'ciTriage',
	'codebaseSize',
	'defaults',
	'dependencyUpdates',
	'forkSync',
	'gitWork',
	'github',
	'maintenance',
	'none',
	'ownership',
	'platform',
	'projectCatalog',
	'publishing',
] as const
const builtinPresetIds: ReadonlySet<string> = new Set(presetIds)

/**
 * Identifies a column preset in the Columns popover, View menu, and saved
 * settings.
 */
export type ColumnPresetId = (typeof presetIds)[number] | `custom:${string}`

/**
 * A named set of visible columns. Applying it hides every other optional
 * repository column and leaves command run columns alone.
 */
export type ColumnPreset = {
	columns: string[]
	/** Built-in hover text, omitted from saved preferences. */
	description?: string
	id: ColumnPresetId
	label: string
}

/**
 * The starter columns, shown on first launch and after Reset View. Built-in
 * presets can't be edited.
 */
export const defaultColumnPreset: ColumnPreset = {
	columns: [
		'repoName',
		'repoOwner',
		'name',
		'description',
		'version',
		'branch',
		'changedFiles',
		'lastCommitDate',
	],
	description: 'The starter columns for everyday repository work.',
	id: 'defaults',
	label: 'Default',
}

/** Built-in selections of optional repository columns. */
export const columnPresets: readonly ColumnPreset[] = [
	{
		columns: [
			'metadata:Stars',
			'metadata:Forks',
			'metadata:Downloads Monthly',
			'metadata:Downloads Total',
			'metadata:Latest Release Date',
		],
		description: 'Usage and public interest through stars, forks, and downloads.',
		id: 'adoption',
		label: 'Adoption',
	},
	{
		columns: ['metadata:CI', 'metadata:CI URL', 'branch', 'lastCommitDate'],
		description: 'Build status, run links, branches, and recent commits.',
		id: 'ciTriage',
		label: 'CI Triage',
	},
	{
		columns: [
			'metadata:Language',
			'metadata:Secondary Language',
			'metadata:Lines of Code',
			'metadata:Total Files',
			'metadata:Total Size MB',
			'metadata:Tracked Size MB',
		],
		description: 'Compare code, file counts, and disk usage.',
		id: 'codebaseSize',
		label: 'Codebase Size',
	},
	defaultColumnPreset,
	{
		columns: [
			'packageManager',
			'metadata:Total Updates',
			'metadata:Major Updates',
			'metadata:Minor Updates',
			'metadata:Patch Updates',
			'metadata:Libyears',
		],
		description: 'Dependency update counts and age. Requires a dependency check.',
		id: 'dependencyUpdates',
		label: 'Dependencies',
	},
	{
		columns: [
			'repoOwner',
			'metadata:Forked From',
			'metadata:Fork Ahead',
			'metadata:Fork Behind',
			'branch',
		],
		description: 'Compare forks with their parent repositories.',
		id: 'forkSync',
		label: 'Fork Sync',
	},
	{
		columns: ['branch', 'changedFiles', 'ahead', 'behind', 'lastCommitDate'],
		description: 'Local changes, branches, and commits to push or pull.',
		id: 'gitWork',
		label: 'Git Work',
	},
	{
		columns: [
			'repoOwner',
			'metadata:Public',
			'metadata:Fork',
			'metadata:Language',
			'metadata:Stars',
			'metadata:PRs Open',
			'metadata:Issues Open',
		],
		description: 'Ownership, visibility, and activity on GitHub.',
		id: 'github',
		label: 'GitHub',
	},
	{
		columns: [
			'metadata:Status',
			'metadata:CI',
			'metadata:PRs Open',
			'metadata:Issues Open',
			'metadata:Vulnerability Alerts',
			'metadata:Total Updates',
		],
		description: 'Builds, open work, security alerts, and dependency updates.',
		id: 'maintenance',
		label: 'Maintenance',
	},
	{
		columns: [],
		description: 'Only Repository and existing command output columns.',
		id: 'none',
		label: 'None',
	},
	{
		columns: [
			'repoOwner',
			'metadata:Author',
			'metadata:Maintainer',
			'metadata:Status',
			'metadata:Public',
			'metadata:License',
		],
		description: 'Project authors, maintainers, ownership, and licensing.',
		id: 'ownership',
		label: 'Ownership',
	},
	{
		columns: [
			'metadata:Language',
			'metadata:Runtime',
			'metadata:Operating System',
			'packageManager',
			'metadata:Monorepo',
		],
		description: 'Languages, runtimes, operating systems, and package managers.',
		id: 'platform',
		label: 'Platform',
	},
	{
		columns: [
			'name',
			'description',
			'metadata:Language',
			'metadata:Tags',
			'metadata:Status',
			'lastCommitDate',
		],
		description: 'Browse project descriptions, languages, tags, and activity.',
		id: 'projectCatalog',
		label: 'Project Catalog',
	},
	{
		columns: [
			'name',
			'version',
			'metadata:Published',
			'metadata:Latest Release Version',
			'metadata:Latest Release Date',
			'metadata:Package URL',
			'metadata:CI',
		],
		description: 'Compare local versions with published releases and package links.',
		id: 'publishing',
		label: 'Publishing',
	},
]

/** Every optional column the table offers, in table order. */
export function allColumnPreset(available: readonly string[]): ColumnPreset {
	return {
		columns: [...available],
		description: 'Every available repository column.',
		id: 'all',
		label: 'All',
	}
}

/** Narrow a menu payload or saved value to a column preset. */
export function isColumnPresetId(value: unknown): value is ColumnPresetId {
	return (
		typeof value === 'string' &&
		(builtinPresetIds.has(value) ||
			(value.startsWith('custom:') && value.length > 7 && value.length <= 100))
	)
}

/** Recover saved column presets from preferences, skipping malformed entries. */
export function parseColumnPresets(value: unknown): ColumnPreset[] {
	if (!Array.isArray(value)) {
		return []
	}

	const presets = new Map<ColumnPresetId, ColumnPreset>()
	for (const entry of value.slice(0, 100) as unknown[]) {
		const record = asRecord(entry)
		if (
			record === undefined ||
			!isColumnPresetId(record.id) ||
			!record.id.startsWith('custom:') ||
			typeof record.label !== 'string' ||
			record.label.trim() === '' ||
			record.label.length > 80 ||
			!Array.isArray(record.columns)
		) {
			continue
		}

		presets.set(record.id, {
			columns: [
				...new Set(
					(record.columns as unknown[]).filter(
						(column): column is string => typeof column === 'string' && column !== '',
					),
				),
			],
			id: record.id,
			label: record.label.trim(),
		})
	}

	return presets.values().toArray()
}

/** Keep Default and All first, then sort other column selections alphabetically. */
export function resolveColumnPresets(
	saved: readonly ColumnPreset[],
	available: readonly string[],
): ColumnPreset[] {
	const remaining = [
		...columnPresets.filter((preset) => preset.id !== 'defaults'),
		...saved.filter((preset) => preset.id.startsWith('custom:')),
	].toSorted((a, b) => a.label.localeCompare(b.label))
	return [defaultColumnPreset, allColumnPreset(available), ...remaining]
}

/**
 * Whether a preset shows exactly the visible columns among `available`, the
 * optional repository columns a preset can show or hide. Columns a preset names
 * that no longer exist are ignored.
 */
export function matchesColumns(
	preset: ColumnPreset,
	visible: Iterable<string>,
	available: readonly string[],
): boolean {
	const shown = new Set(preset.columns)
	const current = new Set(visible)
	return available.every((id) => shown.has(id) === current.has(id))
}
