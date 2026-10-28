<script lang="ts">
	import { tick } from 'svelte'
	import type { FilterPresetId } from './filter-presets.js'
	import type { createRowFilter } from './row-filter-state.svelte.js'
	import type { FilterMatch } from './row-filter.js'
	import type { CommandRun, Repository } from './workspace.js'
	import { focusLastFilterRule } from './filter-focus.js'
	import { isFilterPresetId } from './filter-presets.js'
	import FilterGroupEditor from './FilterGroupEditor.svelte'

	/**
	 * The filter toolbar and rule editor. The preset picker chooses a filter and
	 * holds the preset commands; the toolbar only adds Save and Revert while the
	 * chosen preset has unsaved edits.
	 */
	const {
		repositories,
		rowFilter,
		runs,
		visibleCount,
	}: {
		repositories: Repository[]
		rowFilter: ReturnType<typeof createRowFilter>
		runs: CommandRun[]
		visibleCount: number
	} = $props()
	const editorId = $props.id()
	const matchModes: FilterMatch[] = ['all', 'any', 'none']
	const selected = $derived(rowFilter.selectedPreset)
	const hasRules = $derived(rowFilter.filter.rules.length > 0)
	const selection = $derived(selected?.id ?? (hasRules ? 'custom' : 'all'))
	// Saved presets can be deleted; a saved edit to a built-in preset can be undone
	const removalLabel = $derived(
		selected === undefined
			? undefined
			: selected.id.startsWith('custom:')
				? `Delete “${selected.label}”`
				: rowFilter.storedPreset
					? `Restore “${selected.label}” default`
					: undefined,
	)
	let altHeld = $state(false)
	let naming = $state(false)
	let name = $state('')
	let nameInput = $state<HTMLInputElement>()
	let picker = $state<HTMLSelectElement>()
	let busy = $state(false)
	let message = $state('')
	const existingName = $derived(
		rowFilter.presets.some((preset) => preset.label.toLowerCase() === name.trim().toLowerCase()),
	)

	function clear() {
		rowFilter.clear()
		message = ''
	}

	async function startFilter() {
		rowFilter.newFilter()
		await focusLastFilterRule()
	}

	async function choose(select: HTMLSelectElement) {
		const { value } = select
		// Commands at the end of the picker run without becoming its selection
		select.value = selection
		message = ''
		switch (value) {
			case 'all': {
				clear()
				break
			}

			case 'new': {
				await startFilter()
				break
			}

			case 'remove': {
				await removePreset()
				break
			}

			case 'save': {
				await beginSave()
				break
			}

			default: {
				if (isFilterPresetId(value)) {
					rowFilter.applyPreset(value)
				}
			}
		}
	}

	async function beginSave() {
		name = selected === undefined ? '' : `${selected.label} copy`
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

	async function save(label: string, id?: FilterPresetId) {
		busy = true
		message = ''
		try {
			await rowFilter.savePreset(label, id)
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

	function revert() {
		if (selected !== undefined) {
			rowFilter.applyPreset(selected.id)
		}

		message = ''
	}

	async function removePreset() {
		busy = true
		message = ''
		try {
			await rowFilter.deletePreset()
		} catch (error) {
			message = error instanceof Error ? error.message : 'The preset could not be removed.'
		} finally {
			busy = false
		}
	}
</script>

<svelte:window
	onblur={() => {
		altHeld = false
	}}
	onkeydown={(event: KeyboardEvent) => {
		altHeld = event.altKey
	}}
	onkeyup={(event: KeyboardEvent) => {
		altHeld = event.altKey
	}}
/>

<section class="filter-panel" aria-label="Repository filter">
	<div class="filter-toolbar">
		<button
			class="filter-disclosure"
			class:filtering={rowFilter.activeRules > 0}
			aria-controls={editorId}
			aria-expanded={rowFilter.open}
			onclick={rowFilter.toggle}
			title={rowFilter.open ? 'Hide filter rules' : 'Show filter rules'}
			type="button"
		>
			<svg
				class="filter-disclosure-icon"
				class:expanded={rowFilter.open}
				aria-hidden="true"
				height="9"
				viewBox="0 0 10 10"
				width="9"><path d="m3 1 5 4-5 4Z" fill="currentColor" /></svg
			>
			Filter
		</button>
		{#if naming}
			<form
				class="filter-save"
				onsubmit={async (event) => {
					event.preventDefault()
					if (await save(name)) {
						await endSave()
					}
				}}
			>
				<label for="{editorId}-name">Preset name</label>
				<input
					bind:this={nameInput}
					id="{editorId}-name"
					class="filter-value"
					disabled={busy}
					maxlength="80"
					onkeydown={async (event) => {
						if (event.key !== 'Escape') {
							return
						}

						event.preventDefault()
						await endSave()
					}}
					placeholder="Name this filter"
					required
					type="text"
					bind:value={name}
				/>
				<button class="button primary" disabled={busy || name.trim() === ''} type="submit"
					>{existingName ? 'Replace preset' : 'Save preset'}</button
				>
				<button class="button subtle" disabled={busy} onclick={endSave} type="button">Cancel</button
				>
			</form>
		{:else}
			<select
				bind:this={picker}
				class="filter-preset-picker"
				aria-label="Filter preset"
				disabled={busy}
				onchange={async (event) => choose(event.currentTarget)}
				value={selection}
			>
				<option value="all">All repositories</option>
				{#if selection === 'custom'}<option value="custom">Custom filter</option>{/if}
				<optgroup label="Presets">
					{#each rowFilter.presets as preset (preset.id)}<option value={preset.id}
							>{preset.label}</option
						>{/each}
				</optgroup>
				<hr />
				<option value="new">New filter…</option>
				{#if hasRules}<option value="save">Save as preset…</option>{/if}
				{#if removalLabel !== undefined}<option value="remove">{removalLabel}</option>{/if}
			</select>
			{#if rowFilter.modified}<span class="filter-edited">Edited</span>
				<button
					class="button subtle"
					disabled={busy || !hasRules}
					onclick={saveChanges}
					title="Replace the rules saved in “{selected?.label}”"
					type="button">Save</button
				>
				<button
					class="button subtle"
					disabled={busy}
					onclick={revert}
					title="Discard edits to “{selected?.label}”"
					type="button">Revert</button
				>
			{:else if selection === 'custom'}
				<button class="button subtle" disabled={busy} onclick={beginSave} type="button"
					>Save preset…</button
				>
			{/if}
		{/if}
		<span class="filter-results"
			>{visibleCount} of {repositories.length} repositories{rowFilter.activeRules > 0
				? ` · ${rowFilter.activeRules} ${rowFilter.activeRules === 1 ? 'rule' : 'rules'}`
				: ''}</span
		>
		{#if rowFilter.undecided > 0}<span
				class="filter-undecided"
				title="Waiting for the metadata these rules read. Dependency updates load when you choose Check Dependencies."
				>{rowFilter.undecided} waiting on metadata</span
			>{/if}
		{#if !naming && selection !== 'all'}
			<button class="button subtle" disabled={busy} onclick={clear} type="button">Clear</button>
		{/if}
	</div>
	{#if message !== ''}<p class="filter-error" role="alert">{message}</p>{/if}
	{#if rowFilter.open}
		<div id={editorId} class="filter-bar" aria-label="Filter rules" role="group">
			{#if hasRules}
				<div class="filter-row">
					<span class="filter-text">Show repositories where</span>
					<select
						aria-label="Match"
						onchange={(event) => {
							const { value } = event.currentTarget
							const match = matchModes.find((mode) => mode === value)
							if (match !== undefined) {
								rowFilter.set({ ...rowFilter.filter, match })
							}
						}}
						value={rowFilter.filter.match}
					>
						{#each matchModes as mode (mode)}<option value={mode}>{mode}</option>{/each}
					</select>
					<span class="filter-text">of the following are true</span>
				</div>
				<FilterGroupEditor
					{altHeld}
					columns={rowFilter.columns}
					group={rowFilter.filter}
					onChange={rowFilter.set}
					{repositories}
					{runs}
				/>
			{:else}
				<div class="filter-empty">
					<span>No rules. Showing all repositories.</span><button
						class="button subtle"
						onclick={startFilter}
						type="button">Add rule</button
					>
				</div>
			{/if}
		</div>
	{/if}
</section>
