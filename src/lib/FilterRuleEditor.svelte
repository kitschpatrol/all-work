<script lang="ts">
	import type { FilterColumn, FilterRule } from './row-filter.js'
	import type { CommandRun, Repository } from './workspace.js'
	import FilterRowActions from './FilterRowActions.svelte'
	import FilterValueInput from './FilterValueInput.svelte'
	import {
		changeOperator,
		dateUnits,
		getOperandShape,
		getOperatorLabel,
		getOperators,
		getValueSuggestions,
		isRuleActive,
		retargetRule,
		runStatuses,
	} from './row-filter.js'

	const {
		altHeld,
		columns,
		onAdd,
		onChange,
		onRemove,
		repositories,
		rule,
		runs,
		showAdd,
	}: {
		altHeld: boolean
		columns: FilterColumn[]
		onAdd: (group: boolean) => void
		onChange: (rule: FilterRule) => void
		onRemove: () => void
		repositories: Repository[]
		rule: FilterRule
		runs: CommandRun[]
		showAdd: boolean
	} = $props()
	const categories = $derived([...new Set(columns.map((column) => column.category))])
	const column = $derived(columns.find((entry) => entry.id === rule.column))
	const kind = $derived(column?.kind ?? 'text')
	const shape = $derived(getOperandShape(kind, rule.operator))
	const suggestions = $derived(
		shape === 'text' ? getValueSuggestions(rule.column, repositories) : [],
	)
	const invalid = $derived(rule.value !== '' && !isRuleActive(rule, runs))

	function chooseColumn(id: string) {
		const next = columns.find((entry) => entry.id === id)
		if (next !== undefined) {
			onChange(retargetRule(rule, kind, next))
		}
	}

	function edit(changes: Partial<FilterRule>) {
		onChange({ ...rule, ...changes })
	}
</script>

<div class="filter-row">
	<select
		class="filter-column"
		aria-label="Column"
		onchange={(event) => {
			chooseColumn(event.currentTarget.value)
		}}
		value={rule.column}
	>
		{#if column === undefined}<option disabled value={rule.column}>Missing column</option>{/if}
		{#each categories as category (category)}
			<optgroup label={category}>
				{#each columns.filter((entry) => entry.category === category) as option (option.id)}
					<option value={option.id}>{option.header}</option>
				{/each}
			</optgroup>
		{/each}
	</select>
	<select
		class="filter-operator"
		aria-label="Comparison"
		onchange={(event) => {
			const { value } = event.currentTarget
			const operator = getOperators(kind).find((entry) => entry === value)
			if (operator !== undefined) {
				onChange(changeOperator(rule, kind, operator))
			}
		}}
		value={rule.operator}
	>
		{#each getOperators(kind) as operator (operator)}
			<option value={operator}
				>{getOperatorLabel(kind, operator, operator === rule.operator)}</option
			>
		{/each}
	</select>
	{#if shape === 'text'}<FilterValueInput
			{invalid}
			onChange={(value: string) => {
				edit({ value })
			}}
			placeholder={rule.operator === 'matches' ? 'Regular expression' : 'Value'}
			{suggestions}
			value={rule.value}
		/>
	{:else if shape === 'number'}<input
			class="filter-number"
			aria-label="Value"
			oninput={(event) => {
				edit({ value: event.currentTarget.value })
			}}
			step="any"
			type="number"
			value={rule.value}
		/>
	{:else if shape === 'range'}<input
			class="filter-number"
			aria-label="Lower bound"
			oninput={(event) => {
				edit({ value: event.currentTarget.value })
			}}
			step="any"
			type="number"
			value={rule.value}
		/><span class="filter-text">and</span><input
			class="filter-number"
			aria-label="Upper bound"
			oninput={(event) => {
				edit({ end: event.currentTarget.value })
			}}
			step="any"
			type="number"
			value={rule.end ?? ''}
		/>
	{:else if shape === 'duration'}<input
			class="filter-number"
			aria-label="Count"
			min="0"
			oninput={(event) => {
				edit({ value: event.currentTarget.value })
			}}
			step="1"
			type="number"
			value={rule.value}
		/><select
			aria-label="Unit"
			onchange={(event) => {
				const { value } = event.currentTarget
				const unit = dateUnits.find((entry) => entry === value)
				if (unit !== undefined) {
					edit({ unit })
				}
			}}
			value={rule.unit ?? 'days'}
			>{#each dateUnits as unit (unit)}<option value={unit}>{unit}</option>{/each}</select
		>
	{:else if shape === 'date'}<input
			class="filter-date"
			aria-label="Date"
			oninput={(event) => {
				edit({ value: event.currentTarget.value })
			}}
			type="date"
			value={rule.value}
		/>
	{:else if shape === 'status'}<select
			aria-label="Status"
			onchange={(event) => {
				edit({ value: event.currentTarget.value })
			}}
			value={rule.value}
			>{#each runStatuses as status (status.value)}<option value={status.value}
					>{status.label}</option
				>{/each}</select
		>
	{/if}
	<FilterRowActions {altHeld} {onAdd} {onRemove} {showAdd} />
</div>
