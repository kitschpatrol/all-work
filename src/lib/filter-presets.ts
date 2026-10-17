import type { FilterGroup } from './row-filter.js'
import { asRecord } from './record.js'
import { parseFilter } from './row-filter.js'

const presetIds = ['changed', 'clean'] as const
const builtinPresetIds: ReadonlySet<string> = new Set(presetIds)

/** Identifies a filter preset in the View menu and saved settings. */
export type FilterPresetId = (typeof presetIds)[number] | `custom:${string}`

export type FilterPreset = { filter: FilterGroup; id: FilterPresetId; label: string }

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

/** Combine the starter presets with saved edits and newly named filters. */
export function resolveFilterPresets(saved: readonly FilterPreset[] = []): FilterPreset[] {
	const presets = new Map(filterPresets.map((preset) => [preset.id, preset]))
	for (const preset of saved) {
		presets.set(preset.id, preset)
	}

	return presets.values().toArray()
}

/** Copy a preset's filter so editing it leaves the preset unchanged. */
export function getPresetFilter(
	id: FilterPresetId,
	presets: readonly FilterPreset[] = filterPresets,
): FilterGroup {
	const preset = presets.find((entry) => entry.id === id)
	return parseFilter(preset?.filter)
}

/**
 * Find the preset a filter matches exactly.
 *
 * @param filter A filter normalized by `parseFilter`, so key order is stable.
 */
export function findFilterPreset(
	filter: FilterGroup,
	presets: readonly FilterPreset[] = filterPresets,
): FilterPresetId | undefined {
	const serialized = JSON.stringify(parseFilter(filter))
	return presets.find((preset) => JSON.stringify(parseFilter(preset.filter)) === serialized)?.id
}
