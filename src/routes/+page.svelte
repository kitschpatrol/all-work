<script lang="ts">
	import type { PageData } from './$types'

	export let data: PageData
</script>

{#each data.projectPaths as projectPath}
	<p>{projectPath}</p>
{/each}
