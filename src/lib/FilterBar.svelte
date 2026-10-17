<script lang="ts">
	import type { FilterPresetId } from './filter-presets.js'
	import type { FilterColumn, FilterGroup, FilterMatch } from './row-filter.js'
	import type { CommandRun, Repository } from './workspace.js'
	import { filterPresets, findFilterPreset, isFilterPresetId } from './filter-presets.js'
	import FilterGroupEditor from './FilterGroupEditor.svelte'
	import { parseFilter, starterFilter } from './row-filter.js'

	/**
	 * The rule builder above the table: a root match mode, its rules and nested
	 * groups, presets, and how many rows wait on metadata the rules read.
	 */
	const {
		columns,
		filter,
		onChange,
		onPreset,
		repositories,
		runs,
		undecided,
	}: {
		columns: FilterColumn[]
		filter: FilterGroup
		onChange: (filter: FilterGroup) => void
		onPreset: (id: FilterPresetId) => void
		repositories: Repository[]
		runs: CommandRun[]
		undecided: number
	} = $props()
	const matchModes: FilterMatch[] = ['all', 'any', 'none']
	const activePreset = $derived(findFilterPreset(parseFilter(filter)) ?? '')
	let altHeld = $state(false)
</script>

<svelte:window
	onblur={() => {
		altHeld = false
	}}
	onkeydown={(event: KeyboardEvent) => {
		altHeld = event.altKey
	}}
	onkeyup={(event: KeyboardEvent) => {
		altHeld = event.altKey
	}}
/>

<section class="filter-bar" aria-label="Filter rules">
	<div class="filter-row">
		<span class="filter-text">Show repositories where</span><select
			aria-label="Match"
			onchange={(event) => {
				const { value } = event.currentTarget
				const match = matchModes.find((mode) => mode === value)
				if (match !== undefined) {
					onChange({ ...filter, match })
				}
			}}
			value={filter.match}
			>{#each matchModes as mode (mode)}<option value={mode}>{mode}</option>{/each}</select
		><span class="filter-text">of the following are true</span>
		<div class="filter-bar-tools">
			{#if undecided > 0}<span
					class="filter-undecided"
					title="Hidden until the metadata these rules read has loaded. Dependency updates load only when you choose Check Dependencies."
					>{undecided} waiting on metadata</span
				>{/if}
			<select
				aria-label="Filter presets"
				onchange={(event) => {
					const id = event.currentTarget.value
					if (isFilterPresetId(id)) {
						onPreset(id)
					}
				}}
				value={activePreset}
				><option disabled hidden value="">Presets</option
				>{#each filterPresets as preset (preset.id)}<option value={preset.id}>{preset.label}</option
					>{/each}</select
			>
			<button
				class="button subtle"
				onclick={() => {
					onChange(starterFilter())
				}}
				type="button">Clear</button
			>
		</div>
	</div>
	<FilterGroupEditor {altHeld} {columns} group={filter} {onChange} {repositories} {runs} />
</section>
