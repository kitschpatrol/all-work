<script lang="ts">
	import { tick } from 'svelte'
	import { on } from 'svelte/events'
	import type { ColumnCompletion } from './command-completion.js'
	import { completeColumnVariable, getColumnCompletion } from './command-completion.js'

	const {
		input,
		onComplete,
		variables,
	}: {
		input: HTMLInputElement | undefined
		onComplete: (value: string, caret: number) => Promise<void>
		variables: Array<{ id: string; label: string; name: string }>
	} = $props()
	const listId = $props.id()
	let list = $state<HTMLUListElement>()
	let token = $state<ColumnCompletion>()
	let activeIndex = $state(0)
	let position = $state({ left: 0, top: 0, width: 320 })
	let dismissed: undefined | { caret: number; value: string }
	const query = $derived(token?.query.toUpperCase() ?? '')
	const matches = $derived(
		token === undefined
			? []
			: variables.filter(
					(variable) =>
						variable.name.includes(query) ||
						variable.label.toUpperCase().replaceAll(' ', '_').includes(query),
				),
	)
	const open = $derived(token !== undefined && matches.length > 0)

	function updatePosition() {
		if (input === undefined) {
			return
		}

		const bounds = input.getBoundingClientRect()
		const width = Math.min(560, Math.max(320, bounds.width), window.innerWidth - 16)
		position = {
			left: Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8)),
			top: bounds.bottom + 4,
			width,
		}
	}

	function update() {
		if (input === undefined) {
			return
		}

		const caret = input.selectionStart ?? input.value.length
		if (dismissed?.value === input.value && dismissed.caret === caret) {
			return
		}

		dismissed = undefined
		token = getColumnCompletion(input.value, caret, input.selectionEnd ?? caret)
		activeIndex = 0
		updatePosition()
	}

	function close() {
		if (input !== undefined) {
			dismissed = { caret: input.selectionStart ?? input.value.length, value: input.value }
		}

		token = undefined
	}

	async function accept(index: number) {
		const variable = matches[index]
		if (input === undefined || token === undefined || variable === undefined) {
			return
		}

		const completed = completeColumnVariable(input.value, token, variable.name)
		dismissed = { caret: completed.caret, value: completed.value }
		token = undefined
		await onComplete(completed.value, completed.caret)
	}

	function keydown(event: KeyboardEvent) {
		if (
			!open ||
			event.isComposing ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			event.shiftKey ||
			!['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key)
		) {
			return
		}

		event.preventDefault()
		event.stopImmediatePropagation()
		if (event.key === 'Escape') {
			close()
		} else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			activeIndex =
				(activeIndex + (event.key === 'ArrowUp' ? -1 : 1) + matches.length) % matches.length
		} else {
			void accept(activeIndex)
		}
	}

	$effect(() => {
		if (input === undefined) {
			return
		}

		const cleanups = [
			on(input, 'input', () => {
				dismissed = undefined
				update()
			}),
			on(input, 'click', update),
			on(input, 'blur', close),
			on(input, 'keydown', keydown, { capture: true }),
			on(input, 'keyup', (event) => {
				if (['ArrowLeft', 'ArrowRight', 'End', 'Home'].includes(event.key)) {
					update()
				}
			}),
		]
		return () => {
			for (const cleanup of cleanups) {
				cleanup()
			}
		}
	})

	$effect(() => {
		input?.setAttribute('role', 'combobox')
		input?.setAttribute('aria-autocomplete', 'list')
		input?.setAttribute('aria-controls', listId)
		input?.setAttribute('aria-expanded', String(open))
		if (open) {
			input?.setAttribute('aria-activedescendant', `${listId}-${activeIndex}`)
			void tick().then(() =>
				list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }),
			)
		} else {
			input?.removeAttribute('aria-activedescendant')
		}
	})
</script>

<svelte:window
	onpointerdown={(event: PointerEvent) => {
		if (
			open &&
			event.target instanceof Node &&
			event.target !== input &&
			!list?.contains(event.target)
		) {
			close()
		}
	}}
	onresize={updatePosition}
/>

{#if open}
	<ul
		bind:this={list}
		id={listId}
		style:left="{position.left}px"
		style:top="{position.top}px"
		style:width="{position.width}px"
		class="completions"
		aria-label="Column variable suggestions"
		role="listbox"
	>
		{#each matches as variable, index (variable.id)}
			<li
				id="{listId}-{index}"
				aria-selected={index === activeIndex}
				onclick={async () => accept(index)}
				onkeydown={keydown}
				onpointerdown={(event) => event.preventDefault()}
				onpointermove={() => {
					activeIndex = index
				}}
				role="option"
				tabindex="-1"
			>
				<span class="completion-label">{variable.label}</span><code>${variable.name}</code>
			</li>
		{/each}
	</ul>
{/if}
