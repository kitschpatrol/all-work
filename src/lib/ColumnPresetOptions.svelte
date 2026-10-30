<script lang="ts">
	import type { createColumnPresets } from './column-preset-state.svelte.js'
	import { isBasicColumnPreset } from './column-presets.js'

	/**
	 * The column preset states and the New command, shared by the toolbar select
	 * and the popover picker: Default, All, and None, Custom while no preset
	 * matches, the other built-ins, then saved presets.
	 */
	const { columnPresets }: { columnPresets: ReturnType<typeof createColumnPresets> } = $props()
	const selected = $derived(columnPresets.selected)
	const basicPresets = $derived(
		columnPresets.presets.filter((preset) => isBasicColumnPreset(preset.id)),
	)
	const builtinPresets = $derived(
		columnPresets.presets.filter(
			(preset) => !preset.id.startsWith('custom:') && !isBasicColumnPreset(preset.id),
		),
	)
	const userPresets = $derived(
		columnPresets.presets.filter((preset) => preset.id.startsWith('custom:')),
	)
</script>

{#each basicPresets as preset (preset.id)}<option title={preset.description} value={preset.id}
		>{preset.label}</option
	>{/each}
<hr />
{#if selected === undefined}<option value="custom">Custom</option>
	<hr />{/if}
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
