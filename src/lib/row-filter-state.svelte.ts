import type { FilterPresetId } from './filter-presets.js'
import type { FilterGroup } from './row-filter.js'
import type { CommandRun, Repository } from './workspace.js'
import { findFilterPreset, getPresetFilter } from './filter-presets.js'
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
	const columns = $derived(getFilterColumns(options.runs()))
	const predicate = $derived(compileFilter(filter, options.runs()))
	// The editor shows only while open with at least one rule
	const shown = $derived(open && filter.rules.length > 0)
	// Blank or invalid rules take no part in filtering
	const activeRules = $derived(countActiveRules(filter, options.runs()))
	const preset = $derived(findFilterPreset(parseFilter(filter)))
	const groups = $derived(getFilterMetadataGroups(filter, options.runs()))
	// Rows hidden only because metadata a rule reads has not loaded
	const undecided = $derived(
		predicate === undefined
			? 0
			: options.repositories().filter((repository) => predicate(repository) === undefined).length,
	)

	function set(next: FilterGroup) {
		filter = next
		options.onChange()
	}

	function applyPreset(id: FilterPresetId) {
		set(getPresetFilter(id))
		open = true
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
	function restore(next: FilterGroup, nextOpen: boolean) {
		filter = next
		open = nextOpen
	}

	// Start a blank rule when showing an editor with none
	function toggle() {
		if (shown) {
			open = false
			return
		}

		if (filter.rules.length === 0) {
			set(starterFilter())
		}

		open = true
	}

	// Choosing the applied preset again clears it, like a checked menu item
	function togglePreset(id: FilterPresetId) {
		if (id === preset) {
			set(emptyFilter())
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
		get columns() {
			return columns
		},
		get filter() {
			return filter
		},
		get groups() {
			return groups
		},
		matches,
		get open() {
			return open
		},
		get preset() {
			return preset
		},
		prune,
		restore,
		set,
		get shown() {
			return shown
		},
		toggle,
		togglePreset,
		get undecided() {
			return undecided
		},
	}
}
