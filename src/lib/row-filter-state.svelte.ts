import type { FilterPreset, FilterPresetId } from './filter-presets.js'
import type { FilterGroup } from './row-filter.js'
import type { CommandRun, Repository } from './workspace.js'
import { findFilterPreset, getPresetFilter, resolveFilterPresets } from './filter-presets.js'
import {
	compileFilter,
	countActiveRules,
	createRule,
	emptyFilter,
	getFilterColumns,
	getFilterMetadataGroups,
	getRuleColumns,
	parseFilter,
	pruneFilter,
	starterFilter,
} from './row-filter.js'

type RowFilterOptions = {
	/** Runs whose columns were cleared but whose output rules still filter by. */
	clearedRuns: () => CommandRun[]
	/** Called after the rules change so newly shown rows can load metadata. */
	onChange: () => void
	onPresetsChange?: (presets: FilterPreset[]) => Promise<void>
	presets?: () => readonly FilterPreset[]
	runs: () => CommandRun[]
}

/**
 * Own the filter rules and whether the Filter popover is showing, and derive
 * everything the table, toolbar, and menu need from them.
 *
 * @param options Sources for the rows and runs that rules evaluate against.
 *
 * @returns Reactive filter state and the actions that change it.
 */
export function createRowFilter(options: RowFilterOptions) {
	let filter = $state.raw<FilterGroup>(emptyFilter())
	let open = $state(false)
	let selectedId = $state<FilterPresetId>()
	const columns = $derived(getFilterColumns(options.runs(), options.clearedRuns()))
	const ruleRuns = $derived([...options.runs(), ...options.clearedRuns()])
	const ruleColumns = $derived(getRuleColumns(filter))
	const savedPresets = $derived(options.presets?.() ?? [])
	const presets = $derived(resolveFilterPresets(savedPresets))
	const predicate = $derived(compileFilter(filter, ruleRuns))
	// Blank or invalid rules take no part in filtering
	const activeRules = $derived(countActiveRules(filter, ruleRuns))
	const preset = $derived(findFilterPreset(filter, presets))
	// A saved preset stays selected while its rules are edited; a built-in only while they match exactly
	const selectedPreset = $derived.by(() => {
		const chosen = presets.find((entry) => entry.id === selectedId)
		return chosen !== undefined && (chosen.id.startsWith('custom:') || sameRules(chosen.filter))
			? chosen
			: presets.find((entry) => entry.id === preset)
	})
	const modified = $derived(selectedPreset !== undefined && !sameRules(selectedPreset.filter))
	const groups = $derived(getFilterMetadataGroups(filter, ruleRuns))

	function sameRules(other: FilterGroup) {
		return JSON.stringify(parseFilter(other)) === JSON.stringify(parseFilter(filter))
	}

	// Editing keeps a saved preset selected; editing a built-in starts a custom filter
	function set(next: FilterGroup) {
		const current = selectedPreset
		selectedId = current?.id.startsWith('custom:') ? current.id : undefined
		filter = next
		options.onChange()
	}

	function applyPreset(id: FilterPresetId) {
		if (presets.every((entry) => entry.id !== id)) {
			return
		}

		set(getPresetFilter(id, presets))
		selectedId = id
	}

	function clear() {
		set(emptyFilter())
		selectedId = undefined
	}

	function newFilter() {
		set(starterFilter())
		selectedId = undefined
		open = true
	}

	async function savePreset(label: string, id?: FilterPresetId) {
		const name = label.trim()
		if (name === '' || name.length > 80) {
			throw new Error('Use a preset name between 1 and 80 characters.')
		}

		if (filter.rules.length === 0) {
			throw new Error('Add a rule before saving a preset.')
		}

		if (options.onPresetsChange === undefined) {
			throw new Error('Filter presets could not be saved.')
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

		if (existing === undefined && savedPresets.length >= 100) {
			throw new Error('Delete a saved preset before adding another. You can keep up to 100.')
		}

		const saved: FilterPreset = {
			filter: parseFilter(filter),
			id: existing?.id ?? `custom:${crypto.randomUUID()}`,
			label: name,
		}
		await options.onPresetsChange([...savedPresets.filter((entry) => entry.id !== saved.id), saved])
		selectedId = saved.id
	}

	// Only saved presets can be deleted; the rules stay in effect as a custom filter
	async function deletePreset() {
		const selected = selectedPreset
		if (
			selected === undefined ||
			!selected.id.startsWith('custom:') ||
			options.onPresetsChange === undefined
		) {
			return
		}

		await options.onPresetsChange(savedPresets.filter((entry) => entry.id !== selected.id))
		selectedId = undefined
	}

	function addColumnRule(columnId: string) {
		const column = columns.find((entry) => entry.id === columnId)
		if (column === undefined) {
			return
		}

		set({ ...filter, rules: [...filter.rules, createRule(column)] })
		open = true
	}

	// Whether any rule, even a blank one, reads the column
	function references(columnId: string) {
		return ruleColumns.has(columnId)
	}

	// Drop rules on columns that no longer exist, such as deleted runs
	function prune() {
		filter = pruneFilter(
			filter,
			columns.map((column) => column.id),
		)
	}

	// Replace the rules without side effects, as when restoring a view
	function restore(next: FilterGroup, sourceId?: FilterPresetId) {
		filter = next
		selectedId = sourceId
	}

	// Choosing the applied preset again clears it, like a checked menu item
	function togglePreset(id: FilterPresetId) {
		if (id === preset) {
			clear()
		} else {
			applyPreset(id)
		}
	}

	// Undecided rows stay hidden until their metadata loads. A new function
	// whenever the rules change, so reading it tracks the rules but not the rows.
	const matches = $derived.by(() => {
		const current = predicate
		return (repository: Repository) => current === undefined || current(repository) === true
	})

	return {
		get activeRules() {
			return activeRules
		},
		addColumnRule,
		applyPreset,
		clear,
		get columns() {
			return columns
		},
		deletePreset,
		get filter() {
			return filter
		},
		get groups() {
			return groups
		},
		get matches() {
			return matches
		},
		get modified() {
			return modified
		},
		newFilter,
		get open() {
			return open
		},
		// The popover opens and closes without changing the applied filter
		set open(value: boolean) {
			open = value
		},
		get preset() {
			return preset
		},
		get presets() {
			return presets
		},
		prune,
		references,
		restore,
		savePreset,
		get selectedPreset() {
			return selectedPreset
		},
		set,
		togglePreset,
	}
}
