<script lang="ts">
	import { tick } from 'svelte'
	import type { createColumnPresets } from './column-preset-state.svelte.js'
	import { isColumnPresetId } from './column-presets.js'

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

	async function choose(select: HTMLSelectElement) {
		const { value } = select
		// Commands at the end of the picker run without becoming its selection
		select.value = selection
		message = ''
		switch (value) {
			case 'remove': {
				await removePreset()
				break
			}

			case 'revert': {
				if (selected !== undefined) {
					columnPresets.applyPreset(selected.id)
				}

				break
			}

			case 'save': {
				await beginSave()
				break
			}

			default: {
				if (isColumnPresetId(value)) {
					columnPresets.applyPreset(value)
				}
			}
		}
	}

	async function beginSave() {
		name = saved && selected !== undefined ? `${selected.label} copy` : ''
		naming = true
		message = ''
		await tick()
		nameInput?.focus()
		nameInput?.select()
	}

	async function endSave() {
		naming = false
		message = ''
		await tick()
		picker?.focus()
	}

	async function save(label: string, id?: `custom:${string}`) {
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
		if (selected !== undefined && selected.id !== 'defaults') {
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
		class="column-presets"
		onsubmit={async (event) => {
			event.preventDefault()
			if (await save(name)) {
				await endSave()
			}
		}}
	>
		<input
			bind:this={nameInput}
			class="column-preset-name"
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
			>{replacing ? 'Replace' : 'Save'}</button
		>
		<button class="button subtle" disabled={busy} onclick={endSave} type="button">Cancel</button>
	</form>
{:else}
	<div class="column-presets">
		<select
			bind:this={picker}
			class="column-preset-picker"
			aria-label="Column preset"
			disabled={busy}
			onchange={async (event) => choose(event.currentTarget)}
			value={selection}
		>
			{#if selected === undefined}<option value="custom">Custom</option>{/if}
			{#each columnPresets.presets as preset (preset.id)}<option value={preset.id}
					>{preset.label}{preset.id === selected?.id && columnPresets.modified
						? ' (edited)'
						: ''}</option
				>{/each}
			<hr />
			<option value="save">Save as preset…</option>
			{#if columnPresets.modified && selected !== undefined}<option value="revert"
					>Revert to “{selected.label}”</option
				>{/if}
			{#if saved && selected !== undefined}<option value="remove">Delete “{selected.label}”</option
				>{/if}
		</select>
		{#if saved && columnPresets.modified}
			<button
				class="button subtle"
				disabled={busy}
				onclick={saveChanges}
				title="Save these columns to “{selected?.label}”"
				type="button">Save</button
			>
		{:else}
			<button
				class="button subtle"
				disabled={busy || (selected !== undefined && !columnPresets.modified)}
				onclick={beginSave}
				title="Save these columns as a new preset"
				type="button">Save…</button
			>
		{/if}
	</div>
{/if}
{#if message !== ''}<p class="column-preset-error" role="alert">{message}</p>{/if}
