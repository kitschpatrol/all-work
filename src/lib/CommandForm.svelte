<script lang="ts">
	import { tick } from 'svelte'
	import { commandPresets } from './command-presets.js'
	import CommandAutocomplete from './CommandAutocomplete.svelte'
	import NumberField from './NumberField.svelte'

	/* eslint-disable ts/no-useless-default-assignment -- $bindable() marks a prop bindable, it is not a default */
	let {
		command = $bindable(),
		concurrency = $bindable(),
		history,
		loading,
		onRun,
		starting,
		targetCount,
		variables,
	}: {
		command: string
		concurrency: number
		history: string[]
		loading: boolean
		onRun: () => Promise<void>
		starting: boolean
		targetCount: number
		variables: Array<{ category: string; id: string; label: string; name: string; preview: string }>
	} = $props()
	/* eslint-enable ts/no-useless-default-assignment */
	const categories = $derived([...new Set(variables.map((variable) => variable.category))])
	let input = $state<HTMLInputElement>()
	let historyIndex = $state(-1)
	let draft = $state('')

	/** Move focus to the command field and select its contents. */
	export function focus() {
		input?.focus()
		input?.select()
	}

	/** Forget the recall position, for example after the history changes. */
	export function resetRecall() {
		historyIndex = -1
		draft = ''
	}

	/**
	 * Replace the command and move focus to the field.
	 *
	 * @param value The new command text.
	 * @param caret Caret position after the replacement, by default the end.
	 */
	export async function choose(value: string, caret = value.length) {
		command = value
		resetRecall()
		await tick()
		input?.focus()
		input?.setSelectionRange(caret, caret)
	}

	function recall(event: KeyboardEvent) {
		if (
			event.isComposing ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			event.shiftKey ||
			(event.key !== 'ArrowUp' && event.key !== 'ArrowDown') ||
			history.length === 0
		) {
			return
		}

		event.preventDefault()
		if (event.key === 'ArrowUp') {
			if (historyIndex === -1) {
				draft = command
				historyIndex = history.length - 1
			} else {
				historyIndex = Math.max(0, historyIndex - 1)
			}

			command = history[historyIndex] ?? ''
		} else if (historyIndex !== -1) {
			historyIndex++
			if (historyIndex >= history.length) {
				historyIndex = -1
				command = draft
			} else {
				command = history[historyIndex] ?? ''
			}
		}

		const target = event.currentTarget
		if (target instanceof HTMLInputElement) {
			void tick().then(() => target.setSelectionRange(target.value.length, target.value.length))
		}
	}

	async function insertVariable(name: string) {
		const insertion = `$${name}`
		const start = input?.selectionStart ?? command.length
		const end = input?.selectionEnd ?? start
		await choose(command.slice(0, start) + insertion + command.slice(end), start + insertion.length)
	}
</script>

<form
	class="command-form"
	aria-label="Run a command"
	onsubmit={(event) => {
		event.preventDefault()
		void onRun()
	}}
>
	<label class="field-label" for="shell-command">Command</label>
	<div class="command-input">
		<input
			bind:this={input}
			id="shell-command"
			aria-label="Shell command"
			autocomplete="off"
			oninput={() => {
				historyIndex = -1
			}}
			onkeydown={recall}
			placeholder="git status --short"
			spellcheck="false"
			bind:value={command}
		/>
		<CommandAutocomplete {input} onComplete={choose} {variables} />

		<select
			class="command-picker command-variables"
			aria-label="Column variables"
			onchange={async (event) => {
				const name = event.currentTarget.value
				event.currentTarget.value = ''
				await insertVariable(name)
			}}
			title="Insert a column variable at the cursor"
			value=""
		>
			<option disabled value="">Variables</option>
			{#each categories as category (category)}
				<optgroup label={category}>
					{#each variables.filter((variable) => variable.category === category) as variable (variable.id)}
						<option title={variable.preview} value={variable.name}>{variable.label}</option>
					{/each}
				</optgroup>
			{/each}
		</select>
		<select
			class="command-picker command-presets"
			aria-label="Command presets"
			onchange={async (event) => {
				const { value } = event.currentTarget
				event.currentTarget.value = ''
				await choose(value)
			}}
			title="Choose a preset command"
			value=""
		>
			<option disabled value="">Presets</option>
			{#each commandPresets as preset (preset.label)}
				<option title={preset.command} value={preset.command}>{preset.label}</option>
			{/each}
		</select>
	</div>
	<div class="parallel-label">
		<label for="parallel-jobs">Jobs</label>
		<NumberField
			id="parallel-jobs"
			label="Parallel jobs"
			max={32}
			onChange={(value: number) => {
				concurrency = value
			}}
			required
			value={concurrency}
		/>
	</div>
	<button
		class="button primary run-button"
		disabled={targetCount === 0 || command.trim() === '' || starting || loading}
		type="submit">▶ {starting ? 'Starting…' : `Run in ${targetCount}`}</button
	>
</form>
