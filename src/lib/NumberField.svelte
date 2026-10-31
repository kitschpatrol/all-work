<script lang="ts">
	const {
		id,
		label,
		max,
		min = 1,
		onChange,
		required = false,
		value,
	}: {
		id: string
		label: string
		max?: number
		min?: number
		onChange: (value: number) => void
		required?: boolean
		value: number
	} = $props()
	let input: HTMLInputElement

	function publish() {
		const next = input.valueAsNumber
		if (Number.isSafeInteger(next) && next >= min && (max === undefined || next <= max)) {
			onChange(next)
		}
	}

	function step(direction: number) {
		if (!input.validity.valid || input.value === '') {
			input.value = String(value)
		}

		input.stepUp(direction)
		publish()
	}

	// Like an AppKit stepper, pressing an arrow leaves keyboard focus where it was
	function keepFocus(event: PointerEvent) {
		event.preventDefault()
	}
</script>

<div class="number-field">
	<input
		bind:this={input}
		{id}
		aria-label={label}
		{max}
		{min}
		onblur={() => {
			input.value = String(value)
		}}
		oninput={publish}
		{required}
		step="1"
		type="number"
		{value}
	/>
	<div class="number-stepper">
		<button
			aria-label="Increase {label.toLowerCase()}"
			disabled={max !== undefined && value >= max}
			onclick={() => step(1)}
			onpointerdown={keepFocus}
			tabindex="-1"
			type="button"
			><svg aria-hidden="true" fill="none" height="4" viewBox="0 0 8 5" width="6"
				><path
					d="m1 4 3-3 3 3"
					stroke="currentColor"
					stroke-linecap="round"
					stroke-linejoin="round"
				/></svg
			></button
		>
		<button
			aria-label="Decrease {label.toLowerCase()}"
			disabled={value <= min}
			onclick={() => step(-1)}
			onpointerdown={keepFocus}
			tabindex="-1"
			type="button"
			><svg aria-hidden="true" fill="none" height="4" viewBox="0 0 8 5" width="6"
				><path
					d="m1 1 3 3 3-3"
					stroke="currentColor"
					stroke-linecap="round"
					stroke-linejoin="round"
				/></svg
			></button
		>
	</div>
</div>
