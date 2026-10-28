<script lang="ts">
	import type { CommandRun } from './workspace.js'
	import { runOutcomes, runProgress } from './table-formatting.js'

	/**
	 * A run column's header: its number, progress, success and failure counts,
	 * and command, sorting the column on click, with stop and remove buttons.
	 */
	const {
		number,
		onRemove,
		onSort,
		onStop,
		run,
		sorted,
	}: {
		number: number
		onRemove: () => Promise<void>
		onSort: (multiple: boolean) => void
		onStop: () => Promise<void>
		run: CommandRun
		sorted: 'asc' | 'desc' | false
	} = $props()
	const outcomes = $derived(runOutcomes(run))
</script>

<div class="run-header">
	<button
		class="sort-button run-sort-button"
		aria-label="Sort output for {run.command}"
		onclick={(event) => {
			onSort(event.shiftKey)
		}}
		type="button"
	>
		<span class="run-header-content">
			<span class="run-label"
				>RUN {number}
				<span>{runProgress(run)}{run.finished ? ' complete' : ' running'}</span
				>{#if outcomes.succeeded > 0}<span
						class="run-outcome succeeded"
						title="{outcomes.succeeded} succeeded">✓ {outcomes.succeeded}</span
					>{/if}{#if outcomes.failed > 0}<span
						class="run-outcome failed"
						title="{outcomes.failed} failed">✕ {outcomes.failed}</span
					>{/if}</span
			><code>$ {run.command}</code>
		</span>
		{#if sorted !== false}<span
				class="sort-indicator"
				class:descending={sorted === 'desc'}
				aria-hidden="true"
			></span>{/if}
	</button>
	<div class="run-actions">
		{#if !run.finished}<button
				class="stop-button"
				aria-label="Stop command"
				onclick={onStop}
				type="button">■</button
			>{/if}<button
			class="remove-button"
			aria-label="Delete output column"
			onclick={onRemove}
			type="button">×</button
		>
	</div>
</div>
