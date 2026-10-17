import type { FilterGroup } from './row-filter.js'

const presetIds = ['changed', 'clean'] as const

/** Identifies a filter preset in the View menu and saved settings. */
export type FilterPresetId = (typeof presetIds)[number]

type FilterPreset = { filter: FilterGroup; id: FilterPresetId; label: string }

/** Named filters that replace the current filter when applied. */
export const filterPresets: readonly FilterPreset[] = [
	{
		filter: {
			match: 'all',
			rules: [{ column: 'changedFiles', operator: 'greaterThan', value: '0' }],
		},
		id: 'changed',
		label: 'With Changes',
	},
	{
		filter: { match: 'all', rules: [{ column: 'changedFiles', operator: 'is', value: '0' }] },
		id: 'clean',
		label: 'Clean',
	},
]

/** Narrow a menu payload to a filter preset. */
export function isFilterPresetId(value: unknown): value is FilterPresetId {
	return presetIds.includes(value as FilterPresetId)
}

/** Copy a preset's filter so editing it leaves the preset unchanged. */
export function getPresetFilter(id: FilterPresetId): FilterGroup {
	const preset = filterPresets.find((entry) => entry.id === id)
	return structuredClone(preset?.filter ?? { match: 'all', rules: [] })
}

/**
 * Find the preset a filter matches exactly.
 *
 * @param filter A filter normalized by `parseFilter`, so key order is stable.
 */
export function findFilterPreset(filter: FilterGroup): FilterPresetId | undefined {
	const serialized = JSON.stringify(filter)
	return filterPresets.find((preset) => JSON.stringify(preset.filter) === serialized)?.id
}
