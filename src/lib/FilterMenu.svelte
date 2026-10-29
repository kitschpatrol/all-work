<script lang="ts">
	import { tick } from 'svelte'
	import type { FilterPresetId } from './filter-presets.js'
	import type { createRowFilter } from './row-filter-state.svelte.js'
	import type { FilterMatch } from './row-filter.js'
	import type { CommandRun, Repository } from './workspace.js'
	import { focusLastFilterRule } from './filter-focus.js'
	import { isFilterPresetId } from './filter-presets.js'
	import FilterGroupEditor from './FilterGroupEditor.svelte'
	import { nextCustomName } from './preset-name.js'

	/**
	 * The Filter control in the table toolbar. Its summary names the applied
	 * filter, and the popover holds the preset picker and the rule editor, so the
	 * toolbar stays one row while rules apply live.
	 */
	const {
		repositories,
		rowFilter,
		runs,
	}: {
		repositories: Repository[]
		rowFilter: ReturnType<typeof createRowFilter>
		runs: CommandRun[]
	} = $props()
	const editorId = $props.id()
	const matchModes: FilterMatch[] = ['all', 'any', 'none']
	const selected = $derived(rowFilter.selectedPreset)
	const hasRules = $derived(rowFilter.filter.rules.length > 0)
	const selection = $derived(selected?.id ?? (hasRules ? 'custom' : 'all'))
	const builtinPresets = $derived(
		rowFilter.presets.filter((preset) => !preset.id.startsWith('custom:')),
	)
	const userPresets = $derived(
		rowFilter.presets.filter((preset) => preset.id.startsWith('custom:')),
	)
	const saved = $derived(selected?.id.startsWith('custom:') === true)
	let menu: HTMLDetailsElement
	let altHeld = $state(false)
	let naming = $state(false)
	let renaming = $state(false)
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

			default: {
				if (isFilterPresetId(value)) {
					rowFilter.applyPreset(value)
				}
			}
		}
	}

	// Proposes the next free "Custom N"; an existing user preset's name replaces that preset
	async function beginSave() {
		name = nextCustomName(rowFilter.presets.map((preset) => preset.label))
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
		if (event.key === 'Escape') {
			rowFilter.open = false
		}
	}}
	onkeyup={(event: KeyboardEvent) => {
		altHeld = event.altKey
	}}
	onpointerdown={(event: PointerEvent) => {
		// Before click, so a menu command that opens the popover is not undone by its own click
		if (rowFilter.open && !event.composedPath().includes(menu)) {
			rowFilter.open = false
		}
	}}
/>

{#snippet presetOptions()}
	<option value="all">None</option>
	{#if selection === 'custom'}<option value="custom">Custom filter</option>{/if}
	<optgroup label="Presets">
		{#each builtinPresets as preset (preset.id)}<option value={preset.id}>{preset.label}</option
			>{/each}
	</optgroup>
	{#if userPresets.length > 0}<optgroup label="User">
			{#each userPresets as preset (preset.id)}<option value={preset.id}
					>{preset.label}{preset.id === selected?.id && rowFilter.modified ? ' *' : ''}</option
				>{/each}
		</optgroup>{/if}
	<hr />
	<option value="new">New filter…</option>
{/snippet}

<div class="menu-control">
	<span style:anchor-name="--{editorId}-label" class="field-label">Filter</span>
	<div class="split-control">
		<select
			class="split-select"
			aria-label="Filter preset"
			disabled={busy}
			onchange={async (event) => choose(event.currentTarget)}
			value={selection}
		>
			{@render presetOptions()}
		</select>
		<details
			bind:this={menu}
			style:--menu-anchor="--{editorId}-menu"
			style:--menu-label-anchor="--{editorId}-label"
			class="column-menu"
			bind:open={rowFilter.open}
		>
			<summary
				class="menu-summary"
				aria-label="Filter rules"
				title={rowFilter.open ? 'Hide filter rules' : 'Show filter rules'}
			></summary>
			<div class="column-options filter-options">
				<div class="column-search">
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

									// Leave the Filter popover open
									event.preventDefault()
									event.stopPropagation()
									await endSave()
								}}
								placeholder="Name this filter"
								required
								type="text"
								bind:value={name}
							/>
							<button class="button primary" disabled={busy || name.trim() === ''} type="submit"
								>{renaming ? 'Rename' : existingName ? 'Replace' : 'Save'}</button
							>
							<button class="button subtle" disabled={busy} onclick={endSave} type="button"
								>Cancel</button
							>
						</form>
					{:else}
						<div class="preset-row">
							<select
								bind:this={picker}
								class="preset-picker"
								aria-label="Filter preset"
								disabled={busy}
								onchange={async (event) => choose(event.currentTarget)}
								value={selection}
							>
								{@render presetOptions()}
							</select>
							{#if !hasRules}
								<button
									class="button subtle"
									disabled={busy}
									onclick={startFilter}
									title="Start a filter with one rule"
									type="button">Add rule</button
								>
							{:else if selected === undefined}
								<button
									class="button subtle"
									disabled={busy}
									onclick={beginSave}
									title="Save these rules as a preset"
									type="button">Save…</button
								>
							{:else if saved && rowFilter.modified}
								<button
									class="button subtle"
									disabled={busy}
									onclick={saveChanges}
									title="Save these rules to “{selected.label}”"
									type="button">Save</button
								>
								<button
									class="button subtle"
									disabled={busy}
									onclick={revert}
									title="Discard edits to “{selected.label}”"
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
									title="Delete “{selected.label}”. The rules stay in effect."
									type="button">Delete</button
								>
							{/if}
						</div>
					{/if}
					{#if message !== ''}<p class="preset-error" role="alert">{message}</p>{/if}
				</div>
				{#if hasRules}
					<div id={editorId} class="filter-bar" aria-label="Filter rules" role="group">
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
					</div>
				{/if}
			</div>
			<span class="menu-caret" aria-hidden="true"></span>
		</details>
	</div>
</div>
