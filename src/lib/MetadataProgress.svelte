<script lang="ts">
	import type { Repository } from './workspace.js'
	import { pendingMetadata } from './table-formatting.js'

	const {
		repositories,
		workspaceId,
	}: {
		repositories: readonly Repository[]
		workspaceId: string
	} = $props()
	const labelId = $props.id()

	// The bar fills against the most metadata pending since loading last went
	// idle, so each new batch of requests starts empty
	let batch = { size: 0, workspaceId: '' }
	const progress = $derived.by(() => {
		const pending = pendingMetadata(repositories)
		const previous = pending.groups === 0 || workspaceId !== batch.workspaceId ? 0 : batch.size
		batch = { size: Math.max(previous, pending.groups), workspaceId }
		return { ...pending, total: batch.size }
	})
</script>

{#if progress.groups > 0}<span class="metadata-status"
		><span id={labelId}
			>Loading metadata for {progress.repositories}
			{progress.repositories === 1 ? 'repository' : 'repositories'}…</span
		><progress
			class="metadata-progress"
			aria-labelledby={labelId}
			max={progress.total}
			value={progress.total - progress.groups}
		></progress></span
	>{/if}
