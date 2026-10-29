<script lang="ts">
	import { tick } from 'svelte'
	import type { createColumnPresets } from './column-preset-state.svelte.js'
	import type { ColumnPresetId } from './column-presets.js'
	import { isColumnPresetId } from './column-presets.js'
	import ColumnPresetOptions from './ColumnPresetOptions.svelte'
	import { nextCustomName } from './preset-name.js'

	/**
	 * Choose, save, and delete column presets at the top of the Columns popover.
	 * Save stores edits to the chosen saved preset; otherwise it names a new one.
	 * The row keeps one height in every state so the checkboxes below never
	 * move.
	 */
	const { columnPresets }: { columnPresets: ReturnType<typeof createColumnPresets> } = $props()
	const selected = $derived(columnPresets.selected)
	const saved = $derived(selected?.id.startsWith('custom:') === true)
	const selection = $derived(selected?.id ?? 'custom')
	let naming = $state(false)
	let renaming = $state(false)
	let name = $state('')
	let nameInput = $state<HTMLInputElement>()
	let picker = $state<HTMLSelectElement>()
	let busy = $state(false)
	let message = $state('')
	const replacing = $derived(
		columnPresets.presets.some(
			(preset) =>
				preset.id.startsWith('custom:') && preset.label.toLowerCase() === name.trim().toLowerCase(),
		),
	)

	function choose(select: HTMLSelectElement) {
		const { value } = select
		message = ''
		if (value === 'new') {
			columnPresets.newSet()
		} else if (isColumnPresetId(value)) {
			columnPresets.applyPreset(value)
		}

		// A command does not become the selection
		select.value = selection
	}

	// Proposes the next free "Custom N"; an existing user preset's name replaces that preset
	async function beginSave() {
		name = nextCustomName(columnPresets.presets.map((preset) => preset.label))
		naming = true
		message = ''
		await tick()
		nameInput?.focus()
		nameInput?.select()
	}

	// Renaming saves the selected preset under a new name, keeping its id
	async function beginRename() {
		if (selected === undefined) {
			return
		}

		name = selected.label
		naming = true
		renaming = true
		message = ''
		await tick()
		nameInput?.focus()
		nameInput?.select()
	}

	async function endSave() {
		naming = false
		renaming = false
		message = ''
		await tick()
		picker?.focus()
	}

	async function save(label: string, id?: ColumnPresetId) {
		busy = true
		message = ''
		try {
			await columnPresets.savePreset(label, id)
			return true
		} catch (error) {
			message = error instanceof Error ? error.message : 'The preset could not be saved.'
			return false
		} finally {
			busy = false
		}
	}

	async function saveChanges() {
		if (selected !== undefined) {
			await save(selected.label, selected.id)
		}
	}

	async function removePreset() {
		busy = true
		message = ''
		try {
			await columnPresets.deletePreset()
		} catch (error) {
			message = error instanceof Error ? error.message : 'The preset could not be deleted.'
		} finally {
			busy = false
		}
	}
</script>

{#if naming}
	<form
		class="preset-row"
		onsubmit={async (event) => {
			event.preventDefault()
			if (await save(name, renaming ? selected?.id : undefined)) {
				await endSave()
			}
		}}
	>
		<input
			bind:this={nameInput}
			class="preset-name"
			aria-label="Preset name"
			disabled={busy}
			maxlength="80"
			onkeydown={async (event) => {
				if (event.key !== 'Escape') {
					return
				}

				// Leave the Columns popover open
				event.preventDefault()
				event.stopPropagation()
				await endSave()
			}}
			placeholder="Preset name"
			required
			type="text"
			bind:value={name}
		/>
		<button class="button primary" disabled={busy || name.trim() === ''} type="submit"
			>{renaming ? 'Rename' : replacing ? 'Replace' : 'Save'}</button
		>
		<button class="button subtle" disabled={busy} onclick={endSave} type="button">Cancel</button>
	</form>
{:else}
	<div class="preset-row">
		<select
			bind:this={picker}
			class="preset-picker"
			aria-label="Column preset"
			disabled={busy}
			onchange={(event) => {
				choose(event.currentTarget)
			}}
			value={selection}
		>
			<ColumnPresetOptions {columnPresets} />
		</select>
		{#if selected === undefined}
			<button
				class="button subtle"
				disabled={busy}
				onclick={beginSave}
				title="Save these columns as a preset"
				type="button">Save…</button
			>
		{:else if saved && columnPresets.modified}
			<button
				class="button subtle"
				disabled={busy}
				onclick={saveChanges}
				title="Save these columns to “{selected.label}”"
				type="button">Save</button
			>
			<button
				class="button subtle"
				disabled={busy}
				onclick={() => {
					columnPresets.applyPreset(selected.id)
				}}
				title="Discard changes to “{selected.label}”"
				type="button">Revert</button
			>
		{:else if saved}
			<button
				class="button subtle"
				disabled={busy}
				onclick={beginRename}
				title="Rename “{selected.label}”"
				type="button">Rename…</button
			>
			<button
				class="button subtle"
				disabled={busy}
				onclick={removePreset}
				title="Delete “{selected.label}”. The columns stay as they are."
				type="button">Delete</button
			>
		{/if}
	</div>
{/if}
{#if message !== ''}<p class="preset-error" role="alert">{message}</p>{/if}
