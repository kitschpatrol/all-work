import type { ColumnPreset, ColumnPresetId } from './column-presets.js'
import { matchesColumns, resolveColumnPresets } from './column-presets.js'

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
 * Track which column preset is showing and save or delete named column sets. A
 * saved preset can be edited in place; changing a built-in's columns by hand
 * starts a custom set instead.
 *
 * @param options Sources for the current columns and saved presets.
 *
 * @returns Reactive preset state and the actions that change it.
 */
export function createColumnPresets(options: ColumnPresetOptions) {
	let selectedId = $state<ColumnPresetId>()
	const saved = $derived(options.presets?.() ?? [])
	const presets = $derived(resolveColumnPresets(saved, options.available()))
	// Available columns that are showing, in table order
	const visible = $derived.by(() => {
		const visibility = options.visibility()
		return options.available().filter((id) => visibility[id] !== false)
	})
	// Only an explicit choice selects a preset. A saved preset stays selected while
	// its columns are edited; a built-in only while they match exactly.
	const selected = $derived.by(() => {
		const chosen = presets.find((preset) => preset.id === selectedId)
		return chosen !== undefined &&
			(chosen.id.startsWith('custom:') || matchesColumns(chosen, visible, options.available()))
			? chosen
			: undefined
	})
	const modified = $derived(
		selected !== undefined && !matchesColumns(selected, visible, options.available()),
	)

	// Call before changing columns by hand: a saved preset stays selected, a built-in gives way to a custom set
	function edit() {
		selectedId = selected?.id.startsWith('custom:') ? selected.id : undefined
	}

	// Start a custom set from the repo name alone
	function newSet() {
		selectedId = undefined
		options.apply(
			Object.fromEntries(options.available().map((column) => [column, column === 'repoName'])),
		)
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
		if (existing !== undefined && !existing.id.startsWith('custom:')) {
			throw new Error('Built-in presets can’t be changed. Choose another name.')
		}

		if (
			id !== undefined &&
			presets.some((entry) => entry.id !== id && entry.label.toLowerCase() === name.toLowerCase())
		) {
			throw new Error(`A preset named “${name}” already exists.`)
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
		if (
			preset === undefined ||
			!preset.id.startsWith('custom:') ||
			options.onPresetsChange === undefined
		) {
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
		get modified() {
			return modified
		},
		newSet,
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
