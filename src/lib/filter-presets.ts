import type { FilterGroup } from './row-filter.js'
import { asRecord } from './record.js'
import { parseFilter } from './row-filter.js'

const presetIds = [
	'changed',
	'clean',
	'outOfSync',
	'readyToPush',
	'readyToPull',
	'mine',
	'github',
	'failingCi',
	'needsAttention',
	'openPrs',
	'recentlyActive',
	'publishedPackages',
	'noRemote',
] as const
const builtinPresetIds: ReadonlySet<string> = new Set(presetIds)

/** Identifies a filter preset in the View menu and saved settings. */
export type FilterPresetId = (typeof presetIds)[number] | `custom:${string}`

export type FilterPreset = {
	/** Built-in hover text, omitted from saved preferences. */
	description?: string
	filter: FilterGroup
	id: FilterPresetId
	label: string
}

/** Named filters that replace the current filter when applied. */
export const filterPresets: readonly FilterPreset[] = [
	{
		description: 'No uncommitted changes.',
		filter: { match: 'all', rules: [{ column: 'changedFiles', operator: 'is', value: '0' }] },
		id: 'clean',
		label: 'Clean',
	},
	{
		description: 'Uncommitted changes in the working tree.',
		filter: {
			match: 'all',
			rules: [{ column: 'changedFiles', operator: 'greaterThan', value: '0' }],
		},
		id: 'changed',
		label: 'Dirty',
	},
	{
		description: 'Commits ahead of or behind the upstream branch.',
		filter: {
			match: 'any',
			rules: [
				{ column: 'behind', operator: 'isNot', value: '0' },
				{ column: 'ahead', operator: 'isNot', value: '0' },
			],
		},
		id: 'outOfSync',
		label: 'Diverged',
	},
	{
		description: 'Latest completed CI run on the default branch failed.',
		filter: { match: 'all', rules: [{ column: 'metadata:CI', operator: 'is', value: 'Failure' }] },
		id: 'failingCi',
		label: 'Failing CI',
	},
	{
		description: 'Repositories with a GitHub remote.',
		filter: { match: 'all', rules: [{ column: 'remote', operator: 'contains', value: 'github' }] },
		id: 'github',
		label: 'GitHub',
	},
	{
		description: 'Repositories you authored or own.',
		filter: {
			match: 'any',
			rules: [
				{ column: 'metadata:Author', operator: 'includesMe', value: '' },
				{ column: 'repoOwner', operator: 'isMe', value: '' },
			],
		},
		id: 'mine',
		label: 'Mine',
	},
	{
		description: 'Uncommitted changes, commits to push or pull, or failing CI.',
		filter: {
			match: 'any',
			rules: [
				{ column: 'changedFiles', operator: 'greaterThan', value: '0' },
				{ column: 'ahead', operator: 'greaterThan', value: '0' },
				{ column: 'behind', operator: 'greaterThan', value: '0' },
				{ column: 'metadata:CI', operator: 'is', value: 'Failure' },
			],
		},
		id: 'needsAttention',
		label: 'Needs Attention',
	},
	{
		description: 'No origin remote configured.',
		filter: { match: 'all', rules: [{ column: 'remote', operator: 'isEmpty', value: '' }] },
		id: 'noRemote',
		label: 'No Remote',
	},
	{
		description: 'At least one open pull request.',
		filter: {
			match: 'all',
			rules: [{ column: 'metadata:PRs Open', operator: 'greaterThan', value: '0' }],
		},
		id: 'openPrs',
		label: 'Open PRs',
	},
	{
		description: 'Projects with a published package.',
		filter: {
			match: 'all',
			rules: [{ column: 'metadata:Published', operator: 'isYes', value: '' }],
		},
		id: 'publishedPackages',
		label: 'Published Packages',
	},
	{
		description: 'A clean working tree with commits to pull and none to push.',
		filter: {
			match: 'all',
			rules: [
				{ column: 'ahead', operator: 'is', value: '0' },
				{ column: 'behind', operator: 'greaterThan', value: '0' },
				{ column: 'changedFiles', operator: 'is', value: '0' },
			],
		},
		id: 'readyToPull',
		label: 'Ready to Pull',
	},
	{
		description: 'A clean working tree with commits to push and none to pull.',
		filter: {
			match: 'all',
			rules: [
				{ column: 'ahead', operator: 'greaterThan', value: '0' },
				{ column: 'behind', operator: 'is', value: '0' },
				{ column: 'changedFiles', operator: 'is', value: '0' },
			],
		},
		id: 'readyToPush',
		label: 'Ready to Push',
	},
	{
		description: 'A commit within the last 30 days.',
		filter: {
			match: 'all',
			rules: [{ column: 'lastCommitDate', operator: 'inLast', unit: 'days', value: '30' }],
		},
		id: 'recentlyActive',
		label: 'Recently Active',
	},
]

/** Narrow a menu payload to a filter preset. */
export function isFilterPresetId(value: unknown): value is FilterPresetId {
	return (
		typeof value === 'string' &&
		(builtinPresetIds.has(value) ||
			(value.startsWith('custom:') && value.length > 7 && value.length <= 100))
	)
}

/** Recover named filters and built-in overrides from saved preferences. */
export function parseFilterPresets(value: unknown): FilterPreset[] {
	if (!Array.isArray(value)) {
		return []
	}

	const presets = new Map<FilterPresetId, FilterPreset>()
	for (const entry of value.slice(0, 100) as unknown[]) {
		const record = asRecord(entry)
		if (
			record === undefined ||
			!isFilterPresetId(record.id) ||
			typeof record.label !== 'string' ||
			record.label.trim() === '' ||
			record.label.length > 80 ||
			asRecord(record.filter) === undefined
		) {
			continue
		}

		presets.set(record.id, {
			filter: parseFilter(record.filter),
			id: record.id,
			label: record.label.trim(),
		})
	}

	return presets.values().toArray()
}

/** Combine starter and saved presets, sorted alphabetically by label. */
export function resolveFilterPresets(saved: readonly FilterPreset[] = []): FilterPreset[] {
	const presets = new Map(filterPresets.map((preset) => [preset.id, preset]))
	for (const preset of saved) {
		presets.set(preset.id, { ...presets.get(preset.id), ...preset })
	}

	return presets
		.values()
		.toArray()
		.toSorted((a, b) => a.label.localeCompare(b.label))
}

/** Copy a preset's filter so editing it leaves the preset unchanged. */
export function getPresetFilter(
	id: FilterPresetId,
	presets: readonly FilterPreset[] = filterPresets,
): FilterGroup {
	const preset = presets.find((entry) => entry.id === id)
	return parseFilter(preset?.filter)
}
