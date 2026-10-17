<script lang="ts">
	import { tick } from 'svelte'
	import type { FilterPresetId } from './filter-presets.js'
	import type { createRowFilter } from './row-filter-state.svelte.js'
	import type { FilterMatch } from './row-filter.js'
	import type { CommandRun, Repository } from './workspace.js'
	import { focusLastFilterRule } from './filter-focus.js'
	import { isFilterPresetId } from './filter-presets.js'
	import FilterGroupEditor from './FilterGroupEditor.svelte'

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
	const selection = $derived(selected?.id ?? (rowFilter.filter.rules.length > 0 ? 'custom' : 'all'))
	let altHeld = $state(false)
	let naming = $state(false)
	let name = $state('')
	let nameInput = $state<HTMLInputElement>()
	let busy = $state(false)
	let message = $state('')
	const existingName = $derived(
		rowFilter.presets.some((preset) => preset.label.toLowerCase() === name.trim().toLowerCase()),
	)

	function clear() {
		rowFilter.clear()
		naming = false
		message = ''
	}

	async function startFilter() {
		rowFilter.newFilter()
		await focusLastFilterRule()
	}

	async function choose(value: string) {
		naming = false
		message = ''
		if (value === 'all') {
			clear()
		} else if (value === 'new') {
			await startFilter()
		} else if (isFilterPresetId(value)) {
			rowFilter.applyPreset(value)
		}
	}

	async function beginSave() {
		name = selected === undefined ? '' : `${selected.label} copy`
		naming = true
		message = ''
		rowFilter.expand()
		await tick()
		nameInput?.focus()
		nameInput?.select()
	}

	async function save(label: string, id?: FilterPresetId) {
		busy = true
		message = ''
		try {
			await rowFilter.savePreset(label, id)
			naming = false
		} catch (error) {
			message = error instanceof Error ? error.message : 'The preset could not be saved.'
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

		naming = false
		message = ''
	}

	async function deletePreset() {
		busy = true
		message = ''
		try {
			await rowFilter.deletePreset()
			naming = false
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
			aria-expanded={rowFilter.shown}
			onclick={rowFilter.toggle}
			title={rowFilter.shown ? 'Collapse filter conditions' : 'Edit filter conditions'}
			type="button"
		>
			<svg
				class="filter-disclosure-icon"
				class:expanded={rowFilter.shown}
				aria-hidden="true"
				height="9"
				viewBox="0 0 10 10"
				width="9"><path d="m3 1 5 4-5 4Z" fill="currentColor" /></svg
			>
			Filter
		</button>
		<select
			class="filter-preset-picker"
			aria-label="Filter presets"
			disabled={busy}
			onchange={async (event) => choose(event.currentTarget.value)}
			value={selection}
		>
			<option value="all">All repositories</option>
			{#if selection === 'custom'}<option value="custom">Custom filter</option>{/if}
			<optgroup label="Presets">
				{#each rowFilter.presets as preset (preset.id)}<option value={preset.id}
						>{preset.label}</option
					>{/each}
			</optgroup>
			<option value="new">New filter…</option>
		</select>
		{#if rowFilter.modified}<span class="filter-edited">Edited</span>
			<button
				class="button subtle"
				disabled={busy || rowFilter.filter.rules.length === 0}
				onclick={saveChanges}
				type="button">Save changes</button
			>
			<button class="button subtle" disabled={busy} onclick={revert} type="button">Revert</button>
		{/if}
		{#if rowFilter.filter.rules.length > 0}
			<button class="button subtle" disabled={busy} onclick={beginSave} type="button"
				>{selected === undefined ? 'Save preset…' : 'Save as…'}</button
			>
		{/if}
		{#if rowFilter.filter.rules.length > 0 || selected !== undefined}
			<button class="button subtle" disabled={busy} onclick={clear} type="button">Clear</button>
		{/if}
		<span class="filter-results"
			>{visibleCount} of {repositories.length} repositories{rowFilter.activeRules > 0
				? ` · ${rowFilter.activeRules} ${rowFilter.activeRules === 1 ? 'condition' : 'conditions'}`
				: ''}</span
		>
		{#if rowFilter.undecided > 0}<span
				class="filter-undecided"
				title="Waiting for the metadata used by these conditions. Dependency updates load when you choose Check Dependencies."
				>{rowFilter.undecided} waiting on metadata</span
			>{/if}
	</div>
	{#if naming}
		<form
			class="filter-save"
			onsubmit={async (event) => {
				event.preventDefault()
				await save(name)
			}}
		>
			<label for="{editorId}-name">Preset name</label>
			<input
				bind:this={nameInput}
				id="{editorId}-name"
				class="filter-value"
				aria-label="Preset name"
				disabled={busy}
				maxlength="80"
				placeholder="Name this filter"
				required
				type="text"
				bind:value={name}
			/>
			<button class="button primary" disabled={busy || name.trim() === ''} type="submit"
				>{existingName ? 'Update preset' : 'Save preset'}</button
			>
			<button
				class="button subtle"
				disabled={busy}
				onclick={() => {
					naming = false
					message = ''
				}}
				type="button">Cancel</button
			>
		</form>
	{/if}
	{#if message !== ''}<p class="filter-error" role="alert">{message}</p>{/if}
	{#if rowFilter.shown}
		<div id={editorId} class="filter-bar" aria-label="Filter rules" role="group">
			{#if rowFilter.filter.rules.length === 0}
				<div class="filter-empty">
					<span>No conditions. Showing all repositories.</span><button
						class="button subtle"
						onclick={startFilter}
						type="button">Add condition</button
					>
				</div>
			{:else}
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
			{/if}
		</div>
		{#if rowFilter.filter.rules.length > 0 && selected !== undefined && (selected.id.startsWith('custom:') || rowFilter.storedPreset)}
			<div class="filter-editor-footer">
				<button
					class="button subtle"
					disabled={busy}
					onclick={deletePreset}
					title={selected.id.startsWith('custom:')
						? 'Delete the preset and keep these conditions as a custom filter'
						: 'Restore the original conditions for this preset'}
					type="button"
					>{selected.id.startsWith('custom:') ? 'Delete preset' : 'Restore default'}</button
				>
			</div>
		{/if}
	{/if}
</section>
