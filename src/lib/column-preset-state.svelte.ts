import type { ColumnPreset, ColumnPresetId } from './column-presets.js'
import { findColumnPreset, matchesColumns, resolveColumnPresets } from './column-presets.js'

type ColumnPresetOptions = {
	/** Merge visibility changes for the available columns into the table. */
	apply: (changes: Record<string, boolean>) => void
	/** Optional repository columns a preset can show or hide, in table order. */
	available: () => readonly string[]
	onPresetsChange?: (presets: ColumnPreset[]) => Promise<void>
	presets?: () => readonly ColumnPreset[]
	/** The table's column visibility, where a missing column is visible. */
	visibility: () => Readonly<Record<string, boolean>>
}

/**
 * Track which column preset is showing, whether its columns were changed by
 * hand, and save or delete named column sets.
 *
 * @param options Sources for the current columns and saved presets.
 *
 * @returns Reactive preset state and the actions that change it.
 */
export function createColumnPresets(options: ColumnPresetOptions) {
	let selectedId = $state<ColumnPresetId>()
	const saved = $derived(options.presets?.() ?? [])
	const presets = $derived(resolveColumnPresets(saved))
	// Available columns that are showing, in table order
	const visible = $derived.by(() => {
		const visibility = options.visibility()
		return options.available().filter((id) => visibility[id] !== false)
	})
	const matched = $derived(findColumnPreset(visible, options.available(), presets))
	// A preset that was deleted elsewhere falls back to the one matching the columns
	const selected = $derived(
		presets.find((preset) => preset.id === selectedId) ??
			presets.find((preset) => preset.id === matched),
	)
	const modified = $derived(
		selected !== undefined && !matchesColumns(selected, visible, options.available()),
	)

	// Call before showing or hiding columns by hand so the preset reads as edited
	function edit() {
		selectedId = selected?.id
	}

	function applyPreset(id: ColumnPresetId) {
		const preset = presets.find((entry) => entry.id === id)
		if (preset === undefined) {
			return
		}

		selectedId = id
		options.apply(
			Object.fromEntries(
				options.available().map((column) => [column, preset.columns.includes(column)]),
			),
		)
	}

	async function savePreset(label: string, id?: ColumnPresetId) {
		const name = label.trim()
		if (name === '' || name.length > 80) {
			throw new Error('Use a preset name between 1 and 80 characters.')
		}

		if (options.onPresetsChange === undefined) {
			throw new Error('Column presets could not be saved.')
		}

		const existing = presets.find((entry) =>
			id === undefined ? entry.label.toLowerCase() === name.toLowerCase() : entry.id === id,
		)
		if (existing?.id === 'defaults') {
			throw new Error('Defaults can’t be changed. Choose another name.')
		}

		if (existing === undefined && saved.length >= 100) {
			throw new Error('Delete a saved preset before adding another. You can keep up to 100.')
		}

		const preset: ColumnPreset = {
			columns: visible,
			id: existing?.id ?? `custom:${crypto.randomUUID()}`,
			label: name,
		}
		await options.onPresetsChange(
			existing === undefined
				? [...saved, preset]
				: saved.map((entry) => (entry.id === preset.id ? preset : entry)),
		)
		selectedId = preset.id
	}

	async function deletePreset() {
		const preset = selected
		if (preset === undefined || preset.id === 'defaults' || options.onPresetsChange === undefined) {
			return
		}

		await options.onPresetsChange(saved.filter((entry) => entry.id !== preset.id))
		selectedId = undefined
	}

	// Replace the selection without applying columns, as when restoring a view
	function restore(id?: ColumnPresetId) {
		selectedId = id
	}

	return {
		applyPreset,
		deletePreset,
		edit,
		// The preset showing exactly the visible columns, for menu check marks
		get matched() {
			return matched
		},
		get modified() {
			return modified
		},
		get presets() {
			return presets
		},
		restore,
		savePreset,
		// The preset being shown or edited, if any
		get selected() {
			return selected
		},
	}
}
