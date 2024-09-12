<script generics="T" lang="ts">
	import { onMount } from 'svelte'
	import { writable, type Writable } from 'svelte/store'

	export let promise: Promise<T>
	export let loadingMessage = 'Loading...'
	export let errorMessage = 'Error loading data'
	export let render = (value: T): string => `${value}`

	// Define a type to manage the state of the async operation
	type AsyncResult<T> = {
		error: boolean
		loading: boolean
		value: T | undefined
	}

	// Store to manage the async state for the cell
	const result: Writable<AsyncResult<T>> = writable({
		error: false,
		loading: true,
		value: undefined,
	})

	// Fetch the data when the component is mounted
	onMount(() => {
		promise
			.then((data) => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				result.set({ error: false, loading: false, value: data })
			})
			.catch(() => {
				result.set({ error: true, loading: false, value: undefined })
			})
	})
</script>

<!-- Render the state -->
{#if $result.loading}
	<p>{loadingMessage}</p>
{:else if $result.error}
	<p>{errorMessage}</p>
{:else if $result.value === undefined}
	<p>Undefined</p>
{:else}
	<p>{render($result.value)}</p>
{/if}
