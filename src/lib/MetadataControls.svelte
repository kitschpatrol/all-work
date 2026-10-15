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
		onRefresh,
		onVisibility,
		selectedCount,
	}: {
		columns: MenuColumn[]
		onRefresh: (groups: MetadataGroup[]) => Promise<void>
		onVisibility: (id: string, visible: boolean) => Promise<void>
		selectedCount: number
	} = $props()
	let columnMenu: HTMLDetailsElement
	let metadataMenu: HTMLDetailsElement
	let search = $state('')
	const categories = $derived([...new Set(columns.map((column) => column.category))])
	async function refresh(groups: MetadataGroup[]) {
		metadataMenu.open = false
		await onRefresh(groups)
	}
</script>

<svelte:window
	onclick={(event: MouseEvent) => {
		for (const menu of [columnMenu, metadataMenu]) {
			if (menu.open && !event.composedPath().includes(menu)) {
				menu.open = false
			}
		}
	}}
	onkeydown={(event: KeyboardEvent) => {
		if (event.key !== 'Escape') {
			return
		}

		columnMenu.open = false
		metadataMenu.open = false
	}}
/>

<details bind:this={metadataMenu} class="column-menu metadata-menu">
	<summary>Metadata</summary>
	<div class="column-options metadata-options">
		<button
			disabled={selectedCount === 0}
			onclick={async () => refresh(['local', 'git', 'github', 'registry', 'ci'])}
			type="button">Refresh selected metadata</button
		>
		<button
			disabled={selectedCount === 0}
			onclick={async () => refresh(['code', 'files'])}
			type="button">Scan selected codebases</button
		>
		<button disabled={selectedCount === 0} onclick={async () => refresh(['updates'])} type="button"
			>Check selected dependency updates</button
		>
	</div>
</details>
<details bind:this={columnMenu} class="column-menu">
	<summary>Columns</summary>
	<div class="column-options">
		<input
			class="column-search"
			aria-label="Find a column"
			placeholder="Find a column…"
			bind:value={search}
		/>
		{#each categories as category (category)}
			{@const matching = columns.filter(
				(column) =>
					column.category === category &&
					column.header.toLowerCase().includes(search.toLowerCase()),
			)}
			{#if matching.length > 0}<strong class="column-category">{category}</strong>{/if}
			{#each matching as column (column.id)}
				<label title={column.note}
					><input
						checked={column.visible}
						onchange={async (event) => onVisibility(column.id, event.currentTarget.checked)}
						type="checkbox"
					/>{column.header}{column.onDemand ? ' · on demand' : ''}</label
				>
			{/each}
		{/each}
	</div>
</details>
