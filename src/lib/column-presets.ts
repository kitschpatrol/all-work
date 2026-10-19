import { asRecord } from './record.js'

/**
 * Identifies a column preset in the Columns popover, View menu, and saved
 * settings.
 */
export type ColumnPresetId = 'defaults' | `custom:${string}`

/**
 * A named set of visible columns. Applying it hides every other optional
 * repository column and leaves command run columns alone.
 */
export type ColumnPreset = { columns: string[]; id: ColumnPresetId; label: string }

/**
 * The starter columns, shown on first launch and after Reset View. It can't be
 * edited.
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
	id: 'defaults',
	label: 'Defaults',
}

/** Narrow a menu payload or saved value to a column preset. */
export function isColumnPresetId(value: unknown): value is ColumnPresetId {
	return (
		typeof value === 'string' &&
		(value === 'defaults' ||
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
			record.id === defaultColumnPreset.id ||
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

/** List Defaults first, then saved presets in the order they were added. */
export function resolveColumnPresets(saved: readonly ColumnPreset[] = []): ColumnPreset[] {
	return [defaultColumnPreset, ...saved.filter((preset) => preset.id !== defaultColumnPreset.id)]
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

/** Find the first preset that shows exactly the visible columns. */
export function findColumnPreset(
	visible: Iterable<string>,
	available: readonly string[],
	presets: readonly ColumnPreset[],
): ColumnPresetId | undefined {
	return presets.find((preset) => matchesColumns(preset, visible, available))?.id
}
