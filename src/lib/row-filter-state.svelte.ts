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
	parseFilter,
	pruneFilter,
	starterFilter,
} from './row-filter.js'

type RowFilterOptions = {
	/** Called after the rules change so newly shown rows can load metadata. */
	onChange: () => void
	onPresetsChange?: (presets: FilterPreset[]) => Promise<void>
	presets?: () => readonly FilterPreset[]
	repositories: () => Repository[]
	runs: () => CommandRun[]
}

/**
 * Own the filter rules and whether the rule editor is showing, and derive
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
	const columns = $derived(getFilterColumns(options.runs()))
	const savedPresets = $derived(options.presets?.() ?? [])
	const presets = $derived(resolveFilterPresets(savedPresets))
	const predicate = $derived(compileFilter(filter, options.runs()))
	// Blank or invalid rules take no part in filtering
	const activeRules = $derived(countActiveRules(filter, options.runs()))
	const preset = $derived(findFilterPreset(filter, presets))
	const selectedPreset = $derived(presets.find((entry) => entry.id === (selectedId ?? preset)))
	const modified = $derived(
		selectedPreset !== undefined &&
			JSON.stringify(parseFilter(filter)) !== JSON.stringify(parseFilter(selectedPreset.filter)),
	)
	const groups = $derived(getFilterMetadataGroups(filter, options.runs()))
	// Rows hidden only because metadata a rule reads has not loaded
	const undecided = $derived(
		predicate === undefined
			? 0
			: options.repositories().filter((repository) => predicate(repository) === undefined).length,
	)

	function set(next: FilterGroup) {
		selectedId ??= preset
		filter = next
		options.onChange()
	}

	function applyPreset(id: FilterPresetId) {
		if (presets.every((entry) => entry.id !== id)) {
			return
		}

		selectedId = id
		set(getPresetFilter(id, presets))
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
		if (savedPresets.every((entry) => entry.id !== existing?.id) && savedPresets.length >= 100) {
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

	async function deletePreset() {
		const selected = selectedPreset
		if (selected === undefined || options.onPresetsChange === undefined) {
			return
		}

		await options.onPresetsChange(savedPresets.filter((entry) => entry.id !== selected.id))
		selectedId = undefined
		if (!selected.id.startsWith('custom:')) {
			applyPreset(selected.id)
		}
	}

	function addColumnRule(columnId: string) {
		const column = columns.find((entry) => entry.id === columnId)
		if (column === undefined) {
			return
		}

		set({ ...filter, rules: [...filter.rules, createRule(column)] })
		open = true
	}

	// Drop rules on columns that no longer exist, such as deleted runs
	function prune() {
		filter = pruneFilter(
			filter,
			columns.map((column) => column.id),
		)
	}

	// Replace the rules and editor visibility without side effects, as when restoring a view
	function restore(next: FilterGroup, nextOpen: boolean, sourceId?: FilterPresetId) {
		filter = next
		open = nextOpen
		selectedId = sourceId
	}

	// Disclosure changes the editor visibility without changing the applied filter
	function toggle() {
		open = !open
	}

	// Choosing the applied preset again clears it, like a checked menu item
	function togglePreset(id: FilterPresetId) {
		if (id === preset) {
			clear()
		} else {
			applyPreset(id)
		}
	}

	// Undecided rows stay hidden until their metadata loads
	function matches(repository: Repository) {
		return predicate === undefined || predicate(repository) === true
	}

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
		matches,
		get modified() {
			return modified
		},
		newFilter,
		get open() {
			return open
		},
		get preset() {
			return preset
		},
		get presets() {
			return presets
		},
		prune,
		restore,
		savePreset,
		get selectedPreset() {
			return selectedPreset
		},
		set,
		get storedPreset() {
			return savedPresets.some((entry) => entry.id === selectedPreset?.id)
		},
		toggle,
		togglePreset,
		get undecided() {
			return undecided
		},
	}
}
