<script lang="ts">
	import { onMount } from 'svelte'
	import type { PageData } from './$types'
	export let data: PageData

	export let showFinderLink = false

	import {
		Table,
		TableBody,
		TableBodyCell,
		TableBodyRow,
		TableHead,
		TableHeadCell,
	} from 'flowbite-svelte'

	type ProjectType = Awaited<(typeof data.projects)[number]>
	type SortKey = keyof ProjectType

	let sortKey: SortKey = 'title'
	let sortDirection: 'asc' | 'desc' = 'asc'

	// Array to hold resolved projects
	let resolvedProjects: ProjectType[] = []

	function compareProjects(a: ProjectType, b: ProjectType): number {
		const aValue = a[sortKey] ?? 0
		const bValue = b[sortKey] ?? 0

		if (aValue < bValue) {
			return sortDirection === 'asc' ? -1 : 1
		}

		if (aValue > bValue) {
			return sortDirection === 'asc' ? 1 : -1
		}

		return 0
	}

	function sortBy(key: SortKey) {
		if (sortKey === key) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'
		} else {
			sortKey = key
			sortDirection = 'asc'
		}

		// Sort the resolved projects whenever sortKey or sortDirection changes
		resolvedProjects.sort(compareProjects)
	}

	onMount(() => {
		for (const projectPromise of data.projects) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			projectPromise
				// eslint-disable-next-line @typescript-eslint/no-loop-func
				.then((project) => {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					resolvedProjects = [...resolvedProjects, project]
					resolvedProjects.sort(compareProjects)
				})
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				.catch((error: unknown) => {
					// Handle errors if necessary
					console.error('Error resolving project:', error)
				})
		}
	})

	function sortIcon(key: SortKey) {
		if (sortKey === key) {
			return sortDirection === 'asc' ? '↑' : '↓'
		}

		return ''
	}

	$: sortUpdateKey = `${sortKey}-${sortDirection}`
</script>

{#key sortUpdateKey}
	<Table striped={true}>
		<TableHead>
			<TableHeadCell on:click={() => sortBy('title')}>Project {sortIcon('title')}</TableHeadCell>
			<TableHeadCell on:click={() => sortBy('type')}>Type {sortIcon('type')}</TableHeadCell>
			<TableHeadCell on:click={() => sortBy('gitIsDirty')}
				>Dirty {sortIcon('gitIsDirty')}</TableHeadCell
			>
			<TableHeadCell on:click={() => sortBy('isRemoteAhead')}
				>Behind {sortIcon('isRemoteAhead')}</TableHeadCell
			>
			<TableHeadCell on:click={() => sortBy('npmDownloadCount')}
				>Outdated {sortIcon('npmDownloadCount')}</TableHeadCell
			>
			<TableHeadCell on:click={() => sortBy('gitHubStarCount')}
				>Stars {sortIcon('gitHubStarCount')}</TableHeadCell
			>
			<TableHeadCell on:click={() => sortBy('npmDownloadCount')}
				>Downloads {sortIcon('npmDownloadCount')}</TableHeadCell
			>
			<TableHeadCell on:click={() => sortBy('isPublic')}
				>Public {sortIcon('isPublic')}</TableHeadCell
			>
			<TableHeadCell on:click={() => sortBy('gitHubLink')}
				>GitHub {sortIcon('gitHubLink')}</TableHeadCell
			>
			<TableHeadCell on:click={() => sortBy('isOnNpm')}>NPM {sortIcon('isOnNpm')}</TableHeadCell>

			{#if showFinderLink}
				<TableHeadCell>Finder</TableHeadCell>
			{/if}
		</TableHead>
		<TableBody tableBodyClass="divide-y">
			{#each resolvedProjects as project}
				<TableBodyRow>
					<TableBodyCell tdClass="px-6 py-1 font-bold">{project.title}</TableBodyCell>
					<TableBodyCell tdClass="px-6 py-1">{project.type}</TableBodyCell>
					<TableBodyCell tdClass="px-6 py-1">
						{#if !project.gitIsClean}
							🚨
						{/if}
					</TableBodyCell>
					<TableBodyCell tdClass="px-6 py-1">
						{#if project.isRemoteAhead === true}
							🚨
						{/if}
					</TableBodyCell>
					<TableBodyCell tdClass="px-6 py-1">
						{project.outdatedPackageCount}
					</TableBodyCell>
					<TableBodyCell tdClass="px-6 py-1">
						{#if project.gitHubStarCount}
							{project.gitHubStarCount}
						{/if}
					</TableBodyCell>
					<TableBodyCell tdClass="px-6 py-1">
						{#if project.npmDownloadCount}
							{project.npmDownloadCount}
						{/if}
					</TableBodyCell>
					<TableBodyCell tdClass="px-6 py-1">
						{#if project.isPublic}
							✅
						{/if}
					</TableBodyCell>
					<TableBodyCell tdClass="px-6 py-1">
						{#if project.gitHubLink}
							<a
								class="font-medium text-primary-600 hover:underline dark:text-primary-500"
								href={project.gitHubLink}>GitHub</a
							>
						{/if}
					</TableBodyCell>

					<TableBodyCell tdClass="px-6 py-1">
						{#if project.isOnNpm}
							<a
								class="font-medium text-primary-600 hover:underline dark:text-primary-500"
								href={`https://www.npmjs.com/package/${project.title}`}>NPM</a
							>
						{/if}
					</TableBodyCell>

					{#if showFinderLink}
						<TableBodyCell tdClass="px-6 py-1">
							<a
								class="font-medium text-primary-600 hover:underline dark:text-primary-500"
								href={`file://${project.repositoryPath}`}>Finder</a
							>
						</TableBodyCell>
					{/if}
				</TableBodyRow>
			{/each}
		</TableBody>
	</Table>
{/key}
