<script lang="ts">
	import type { createColumnPresets } from './column-preset-state.svelte.js'

	/**
	 * The column preset states and the New command, shared by the toolbar select
	 * and the popover picker: Custom while no preset matches, the built-ins, then
	 * saved presets.
	 */
	const { columnPresets }: { columnPresets: ReturnType<typeof createColumnPresets> } = $props()
	const selected = $derived(columnPresets.selected)
	const builtinPresets = $derived(
		columnPresets.presets.filter((preset) => !preset.id.startsWith('custom:')),
	)
	const userPresets = $derived(
		columnPresets.presets.filter((preset) => preset.id.startsWith('custom:')),
	)
</script>

{#if selected === undefined}<option value="custom">Custom</option>{/if}
<optgroup label="Presets">
	{#each builtinPresets as preset (preset.id)}<option title={preset.description} value={preset.id}
			>{preset.label}</option
		>{/each}
</optgroup>
{#if userPresets.length > 0}<optgroup label="User">
		{#each userPresets as preset (preset.id)}<option value={preset.id}
				>{preset.label}{preset.id === selected?.id && columnPresets.modified ? ' *' : ''}</option
			>{/each}
	</optgroup>{/if}
<hr />
<option value="new">New column set…</option>
