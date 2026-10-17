<script lang="ts">
	import type {
		FilterColumn,
		FilterGroup,
		FilterMatch,
		FilterNode,
		FilterRule,
	} from './row-filter.js'
	import type { CommandRun, Repository } from './workspace.js'
	import FilterGroupEditor from './FilterGroupEditor.svelte'
	import FilterRowActions from './FilterRowActions.svelte'
	import FilterRuleEditor from './FilterRuleEditor.svelte'
	import { blankRule, createRule, isFilterGroup } from './row-filter.js'

	/**
	 * Edit the rules and nested groups inside one group. Nested groups render
	 * their own "Any of the following" header and indent their contents; a group
	 * left empty is removed from its parent.
	 */
	const {
		altHeld,
		columns,
		group,
		onChange,
		repositories,
		runs,
	}: {
		altHeld: boolean
		columns: FilterColumn[]
		group: FilterGroup
		onChange: (group: FilterGroup) => void
		repositories: Repository[]
		runs: CommandRun[]
	} = $props()
	const matchModes: Array<{ label: string; value: FilterMatch }> = [
		{ label: 'All', value: 'all' },
		{ label: 'Any', value: 'any' },
		{ label: 'None', value: 'none' },
	]

	function newRule(after: FilterNode) {
		const column = isFilterGroup(after)
			? undefined
			: columns.find((entry) => entry.id === after.column)
		return column === undefined ? blankRule() : createRule(column)
	}

	function add(index: number, nested: boolean) {
		const node = group.rules[index]
		if (node === undefined) {
			return
		}

		const rule = newRule(node)
		onChange({
			...group,
			rules: group.rules.toSpliced(index + 1, 0, nested ? { match: 'any', rules: [rule] } : rule),
		})
	}

	function remove(index: number) {
		onChange({ ...group, rules: group.rules.toSpliced(index, 1) })
	}

	function replace(index: number, node: FilterNode) {
		if (isFilterGroup(node) && node.rules.length === 0) {
			remove(index)
		} else {
			onChange({ ...group, rules: group.rules.with(index, node) })
		}
	}
</script>

<!-- Every edit replaces the rule objects, so key by position to keep focus in the field being typed in -->
{#each group.rules as node, index (index)}
	{#if isFilterGroup(node)}
		<div class="filter-row">
			<select
				aria-label="Group match"
				onchange={(event) => {
					const { value } = event.currentTarget
					const match = matchModes.find((mode) => mode.value === value)
					if (match !== undefined) {
						replace(index, { ...node, match: match.value })
					}
				}}
				value={node.match}
				>{#each matchModes as mode (mode.value)}<option value={mode.value}>{mode.label}</option
					>{/each}</select
			><span class="filter-text">of the following are true</span>
			<FilterRowActions
				{altHeld}
				onAdd={(nested: boolean) => {
					add(index, nested)
				}}
				onRemove={() => {
					remove(index)
				}}
				showAdd={index === group.rules.length - 1}
			/>
		</div>
		<div class="filter-group">
			<FilterGroupEditor
				{altHeld}
				{columns}
				group={node}
				onChange={(next: FilterGroup) => {
					replace(index, next)
				}}
				{repositories}
				{runs}
			/>
		</div>
	{:else}
		<FilterRuleEditor
			{altHeld}
			{columns}
			onAdd={(nested: boolean) => {
				add(index, nested)
			}}
			onChange={(next: FilterRule) => {
				replace(index, next)
			}}
			onRemove={() => {
				remove(index)
			}}
			{repositories}
			rule={node}
			{runs}
			showAdd={index === group.rules.length - 1}
		/>
	{/if}
{/each}
