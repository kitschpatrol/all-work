<script lang="ts">
	import AsyncField from '$lib/components/AsyncField.svelte'
	import type { PageData } from './$types'
	export let data: PageData

	async function remoteStatusRender(
		value: Awaited<(typeof data.projects)[number]['remoteStatus']>,
	) {
		return `${Object.values(value).some((value) => value > 0)}`
	}

	function outdatedPackageListRender(value: string[]) {
		return `${value.length}`
	}
</script>

<!-- Render Table -->
{#each data.projects as project}
	<hr />
	<p>{project.repositoryPath}</p>
	<p>{project.type}</p>

	<AsyncField promise={project.gitIsClean} />
	<AsyncField promise={project.gitRemoteCount} />
	<AsyncField promise={project.isRemoteAhead} />
	<AsyncField promise={project.outdatedPackageList} render={outdatedPackageListRender} />
{/each}
