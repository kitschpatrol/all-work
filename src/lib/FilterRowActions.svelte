<script lang="ts">
	/**
	 * Remove and add buttons directly after a filter row's fields. As in Finder,
	 * holding Option turns add into "add a group of rules".
	 */
	const {
		altHeld,
		onAdd,
		onRemove,
		showAdd,
	}: {
		altHeld: boolean
		onAdd: (group: boolean) => void
		onRemove: () => void
		showAdd: boolean
	} = $props()
</script>

<div class="filter-row-actions">
	<button class="filter-round-button" aria-label="Remove" onclick={onRemove} type="button">
		<svg
			aria-hidden="true"
			fill="none"
			height="10"
			stroke="currentColor"
			stroke-width="1.25"
			viewBox="0 0 10 10"
			width="10"><path d="M1 5h8" /></svg
		>
	</button>
	{#if showAdd}
		<button
			class="filter-round-button"
			aria-label={altHeld ? 'Add a group of rules' : 'Add a rule'}
			onclick={(event) => {
				onAdd(event.altKey)
			}}
			title={altHeld ? 'Add a group of rules' : 'Add a rule. Option-click to add a group of rules.'}
			type="button"
		>
			<svg aria-hidden="true" fill="currentColor" height="10" viewBox="0 0 10 10" width="10">
				{#if altHeld}
					<circle cx="2" cy="5" r="0.8" /><circle cx="5" cy="5" r="0.8" /><circle
						cx="8"
						cy="5"
						r="0.8"
					/>
				{:else}
					<path d="M1 5h8M5 1v8" fill="none" stroke="currentColor" stroke-width="1.25" />
				{/if}
			</svg>
		</button>
	{/if}
</div>
