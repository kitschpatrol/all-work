<script lang="ts">
	import type { MetadataGroup } from './workspace.js'
	type MenuColumn = {
		category: string
		header: string
		id: string
		note?: string
		onDemand: boolean
		visible: boolean
	}
	const {
		columns,
		disabled,
		onRefresh,
		onVisibility,
		onVisibilityAll,
		onVisibilityDefaults,
		selectedCount,
	}: {
		columns: MenuColumn[]
		disabled: boolean
		onRefresh: (groups: MetadataGroup[]) => Promise<void>
		onVisibility: (id: string, visible: boolean) => Promise<void>
		onVisibilityAll: (visible: boolean) => Promise<void>
		onVisibilityDefaults: () => Promise<void>
		selectedCount: number
	} = $props()
	let columnMenu: HTMLDetailsElement
	let search = $state('')
	const categories = $derived([...new Set(columns.map((column) => column.category))])
	const matchingColumns = $derived(
		columns.filter((column) => column.header.toLowerCase().includes(search.toLowerCase())),
	)
	const scope = $derived(
		`${selectedCount} selected ${selectedCount === 1 ? 'repository' : 'repositories'}`,
	)
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

<button
	class="button subtle"
	{disabled}
	onclick={async () => onRefresh(['local', 'git', 'github', 'registry', 'ci', 'code', 'files'])}
	title={selectedCount === 0
		? 'Select repositories to refresh metadata'
		: `Refresh metadata for ${scope}`}
	type="button">Refresh Metadata</button
>
<button
	class="button subtle"
	{disabled}
	onclick={async () => onRefresh(['updates'])}
	title={selectedCount === 0
		? 'Select repositories to check dependencies'
		: `Check dependencies for ${scope}`}
	type="button">Check Dependencies</button
>
<details bind:this={columnMenu} class="column-menu">
	<summary>Columns</summary>
	<div class="column-options">
		<div class="column-width-reference" aria-hidden="true">
			{#each columns as column (column.id)}
				<span>{column.header}{column.onDemand ? ' · on demand' : ''}</span>
			{/each}
		</div>
		<div class="column-search">
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
				<button
					class="button subtle"
					onclick={onVisibilityDefaults}
					title="Restore the starter columns"
					type="button">Defaults</button
				>
			</div>
		</div>
		<div class="column-list">
			{#each categories as category (category)}
				{@const matching = matchingColumns.filter((column) => column.category === category)}
				{#if matching.length > 0}<div class="column-group">
						<strong class="column-category">{category}</strong>
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
</details>
