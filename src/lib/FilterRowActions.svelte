<script lang="ts">
	/**
	 * Remove and add buttons at the end of a filter row. As in Finder, holding
	 * Option turns add into "add a group of rules".
	 */
	const {
		altHeld,
		onAdd,
		onRemove,
	}: { altHeld: boolean; onAdd: (group: boolean) => void; onRemove: () => void } = $props()
</script>

<div class="filter-row-actions">
	<button class="filter-round-button" aria-label="Remove" onclick={onRemove} type="button">−</button
	><button
		class="filter-round-button"
		aria-label={altHeld ? 'Add a group of rules' : 'Add a rule'}
		onclick={(event) => {
			onAdd(event.altKey)
		}}
		title={altHeld ? 'Add a group of rules' : 'Add a rule. Option-click to add a group of rules.'}
		type="button">{altHeld ? '…' : '+'}</button
	>
</div>
