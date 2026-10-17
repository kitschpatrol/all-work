<script lang="ts">
	import { tick } from 'svelte'
	import { on } from 'svelte/events'

	/**
	 * A rule's text value with suggestions from the loaded repositories, listed
	 * one per line beside how many repositories have each. Unlike command
	 * completions, nothing is highlighted until an arrow key moves into the list,
	 * so typing, Return, and Tab behave as in a plain field.
	 */
	const {
		invalid,
		onChange,
		placeholder,
		suggestions,
		value,
	}: {
		invalid: boolean
		onChange: (value: string) => void
		placeholder: string
		suggestions: Array<{ count: number; value: string }>
		value: string
	} = $props()
	const listId = $props.id()
	let input = $state<HTMLInputElement>()
	let list = $state<HTMLUListElement>()
	let expanded = $state(false)
	let activeIndex = $state(-1)
	let position = $state({ left: 0, top: 0, width: 240 })
	const matches = $derived.by(() => {
		const query = value.trim().toLowerCase()
		return suggestions.filter((suggestion) => {
			const candidate = suggestion.value.toLowerCase()
			return candidate !== query && candidate.includes(query)
		})
	})
	const open = $derived(expanded && matches.length > 0)

	function show() {
		if (input === undefined) {
			return
		}

		const bounds = input.getBoundingClientRect()
		const width = Math.min(420, Math.max(240, bounds.width), window.innerWidth - 16)
		position = {
			left: Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8)),
			top: bounds.bottom + 4,
			width,
		}
		expanded = true
		activeIndex = -1
	}

	function hide() {
		expanded = false
		activeIndex = -1
	}

	function accept(index: number) {
		const match = matches[index]
		if (match === undefined) {
			return
		}

		hide()
		onChange(match.value)
	}

	function move(step: number) {
		if (!open) {
			show()
		}

		if (!open) {
			return
		}

		activeIndex =
			activeIndex === -1
				? step > 0
					? 0
					: matches.length - 1
				: (activeIndex + step + matches.length) % matches.length
	}

	function keydown(event: KeyboardEvent) {
		if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
			return
		}

		switch (event.key) {
			case 'ArrowDown':
			case 'ArrowUp': {
				event.preventDefault()
				move(event.key === 'ArrowUp' ? -1 : 1)
				break
			}

			case 'Enter': {
				if (open && activeIndex !== -1) {
					event.preventDefault()
					accept(activeIndex)
				}

				break
			}

			case 'Escape': {
				if (open) {
					event.preventDefault()
					event.stopPropagation()
					hide()
				}

				break
			}

			default:
		}
	}

	// The list is placed in the viewport, so close it when anything under it moves
	$effect(() => {
		if (!open) {
			return
		}

		const cleanups = [
			on(
				globalThis,
				'scroll',
				(event) => {
					if (event.target !== list) {
						hide()
					}
				},
				{ capture: true },
			),
			on(globalThis, 'resize', hide),
		]
		return () => {
			for (const cleanup of cleanups) {
				cleanup()
			}
		}
	})

	$effect(() => {
		if (open && activeIndex !== -1) {
			void tick().then(() =>
				list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }),
			)
		}
	})
</script>

<input
	bind:this={input}
	class="filter-value"
	class:invalid
	aria-activedescendant={open && activeIndex !== -1 ? `${listId}-${activeIndex}` : undefined}
	aria-autocomplete={suggestions.length > 0 ? 'list' : undefined}
	aria-controls={listId}
	aria-expanded={open}
	aria-invalid={invalid}
	aria-label="Value"
	autocomplete="off"
	onblur={hide}
	onclick={show}
	oninput={(event) => {
		onChange(event.currentTarget.value)
		show()
	}}
	onkeydown={keydown}
	{placeholder}
	role="combobox"
	spellcheck="false"
	title={invalid ? 'Enter a valid regular expression' : undefined}
	type="text"
	{value}
/>
{#if open}
	<ul
		bind:this={list}
		id={listId}
		style:left="{position.left}px"
		style:top="{position.top}px"
		style:width="{position.width}px"
		class="completions"
		aria-label="Suggested values and how many repositories have each"
		role="listbox"
	>
		{#each matches as match, index (match.value)}
			<li
				id="{listId}-{index}"
				aria-selected={index === activeIndex}
				onclick={() => {
					accept(index)
				}}
				onkeydown={keydown}
				onpointerdown={(event) => {
					event.preventDefault()
				}}
				onpointermove={() => {
					activeIndex = index
				}}
				role="option"
				tabindex="-1"
			>
				<span class="completion-label">{match.value}</span><span class="completion-count"
					>{match.count}</span
				>
			</li>
		{/each}
	</ul>
{/if}
