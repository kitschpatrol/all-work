<script lang="ts">
	import type { createColumnPresets } from './column-preset-state.svelte.js'
	import ColumnPresetPicker from './ColumnPresetPicker.svelte'

	type MenuColumn = {
		category: string
		header: string
		id: string
		note?: string
		onDemand: boolean
		visible: boolean
	}
	const {
		columnPresets,
		columns,
		onVisibility,
		onVisibilityAll,
		onVisibilityMany,
	}: {
		columnPresets: ReturnType<typeof createColumnPresets>
		columns: MenuColumn[]
		onVisibility: (id: string, visible: boolean) => Promise<void>
		onVisibilityAll: (visible: boolean) => Promise<void>
		onVisibilityMany: (ids: string[], visible: boolean) => Promise<void>
	} = $props()
	let columnMenu: HTMLDetailsElement
	let search = $state('')
	const categories = $derived([...new Set(columns.map((column) => column.category))])
	const matchingColumns = $derived(
		columns.filter((column) => column.header.toLowerCase().includes(search.toLowerCase())),
	)
	const summary = $derived(
		columnPresets.selected === undefined
			? 'Custom'
			: `${columnPresets.selected.label}${columnPresets.modified ? ' *' : ''}`,
	)
	const summaryId = $props.id()
</script>

<svelte:window
	onclick={(event: MouseEvent) => {
		if (columnMenu.open && !event.composedPath().includes(columnMenu)) {
			columnMenu.open = false
		}
	}}
	onkeydown={(event: KeyboardEvent) => {
		if (event.key !== 'Escape') {
			return
		}

		columnMenu.open = false
	}}
/>

<div class="menu-control">
	<span id="{summaryId}-label" class="field-label">Columns</span>
	<details bind:this={columnMenu} style:--menu-anchor="--{summaryId}-menu" class="column-menu">
		<summary
			class="menu-summary"
			aria-labelledby="{summaryId}-label {summaryId}-summary"
			title="Choose which columns to show"
			><span id="{summaryId}-summary" class="menu-summary-text">{summary}</span></summary
		>
		<div class="column-options">
			<div class="column-width-reference" aria-hidden="true">
				{#each columns as column (column.id)}
					<span>{column.header}{column.onDemand ? ' · on demand' : ''}</span>
				{/each}
			</div>
			<div class="column-search">
				<ColumnPresetPicker {columnPresets} />
				<div class="column-search-field">
					<input
						aria-label="Find a column"
						placeholder="Find a column…"
						type="search"
						bind:value={search}
					/>
				</div>
				<div class="column-menu-actions">
					<button
						class="button subtle"
						disabled={columns.every((column) => column.visible)}
						onclick={async () => onVisibilityAll(true)}
						title="Show all optional columns"
						type="button">Select all</button
					>
					<button
						class="button subtle"
						disabled={columns.every((column) => !column.visible)}
						onclick={async () => onVisibilityAll(false)}
						title="Hide all optional columns"
						type="button">Deselect all</button
					>
				</div>
			</div>
			<div class="column-list">
				{#each categories as category (category)}
					{@const matching = matchingColumns.filter((column) => column.category === category)}
					{@const children = columns.filter((column) => column.category === category)}
					{@const allVisible = children.every((column) => column.visible)}
					{#if matching.length > 0}<div class="column-group">
							<label class="column-category">
								<input
									aria-label="All {category} columns"
									checked={allVisible}
									disabled={search !== ''}
									indeterminate={!allVisible && children.some((column) => column.visible)}
									onchange={async (event) =>
										onVisibilityMany(
											children.map((column) => column.id),
											event.currentTarget.checked,
										)}
									type="checkbox"
								/>
								<strong>{category}</strong>
							</label>
							{#each matching as column (column.id)}
								<label title={column.note}
									><input
										checked={column.visible}
										onchange={async (event) => onVisibility(column.id, event.currentTarget.checked)}
										type="checkbox"
									/>{column.header}{column.onDemand ? ' · on demand' : ''}</label
								>
							{/each}
						</div>{/if}
				{/each}
				{#if matchingColumns.length === 0}<p class="column-no-results">No results</p>{/if}
			</div>
		</div>
		<span class="menu-caret" aria-hidden="true"></span>
	</details>
</div>
