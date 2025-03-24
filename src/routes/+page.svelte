<script lang="ts">
	import { onMount } from 'svelte'
	import {
		Table,
		TableBody,
		TableBodyCell,
		TableBodyRow,
		TableHead,
		TableHeadCell,
	} from 'flowbite-svelte'
	import {
		ArchiveSolid,
		FileCodeSolid,
		FolderSolid,
		GithubSolid,
		NpmSolid,
	} from 'flowbite-svelte-icons'

	const { data } = $props()

	type ProjectType = Awaited<(typeof data.projects)[number]>
	type SortKey = keyof ProjectType

	let sortKey: SortKey = $state('title')
	let sortDirection: 'asc' | 'desc' = $state('asc')

	// Array to hold resolved projects
	let resolvedProjects: ProjectType[] = $state([])

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
			projectPromise
				.then((project) => {
					resolvedProjects = [...resolvedProjects, project]
					resolvedProjects.sort(compareProjects)
				})

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

	let sortUpdateKey = $derived(`${sortKey}-${sortDirection}`)
</script>

{#key sortUpdateKey}
	<Table striped={true}>
		<TableHead>
			<TableHeadCell on:click={() => sortBy('title')}>Project {sortIcon('title')}</TableHeadCell>
			<TableHeadCell on:click={() => sortBy('type')}>Type {sortIcon('type')}</TableHeadCell>
			<TableHeadCell on:click={() => sortBy('lastCommitDate')}
				>Last Commit {sortIcon('lastCommitDate')}</TableHeadCell
			>
			<TableHeadCell on:click={() => sortBy('gitIsDirty')}
				>Dirty {sortIcon('gitIsDirty')}</TableHeadCell
			>
			<TableHeadCell on:click={() => sortBy('isRemoteAhead')}
				>Behind {sortIcon('isRemoteAhead')}</TableHeadCell
			>
			<TableHeadCell on:click={() => sortBy('semverUpdateCount')}
				>Semver Updates {sortIcon('semverUpdateCount')}</TableHeadCell
			>
			<TableHeadCell on:click={() => sortBy('majorUpdateCount')}
				>Major Updates {sortIcon('majorUpdateCount')}</TableHeadCell
			>
			<TableHeadCell on:click={() => sortBy('issueCount')}
				>Issues {sortIcon('issueCount')}</TableHeadCell
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

			<TableHeadCell></TableHeadCell>
			<TableHeadCell></TableHeadCell>
			<TableHeadCell></TableHeadCell>
			<TableHeadCell></TableHeadCell>
			<TableHeadCell></TableHeadCell>
		</TableHead>
		<TableBody tableBodyClass="divide-y">
			{#each resolvedProjects as project (project.repositoryPath)}
				<TableBodyRow>
					<!-- Title -->
					<TableBodyCell tdClass="px-6 py-1 font-bold">
						{project.title}
					</TableBodyCell>

					<!-- Source or Fork -->
					<TableBodyCell tdClass="px-6 py-1">{project.type}</TableBodyCell>

					<!-- Last commit -->
					<TableBodyCell tdClass="px-6 py-1">
						{#if project.lastCommitDate !== undefined}
							{project.lastCommitDate}
						{/if}
					</TableBodyCell>

					<!-- Git clean -->
					<TableBodyCell tdClass="px-6 py-1">
						{#if !project.gitIsClean}
							📝
						{/if}
					</TableBodyCell>

					<!-- Remote ahead -->
					<TableBodyCell tdClass="px-6 py-1">
						{#if project.isRemoteAhead === true}
							📥
						{/if}
					</TableBodyCell>

					<!-- Semver Updates -->
					<TableBodyCell tdClass="px-6 py-1">
						{#if project.semverUpdateCount > 0}
							{project.semverUpdateCount}
						{/if}
					</TableBodyCell>

					<!-- Major Updates -->
					<TableBodyCell tdClass="px-6 py-1">
						{#if project.majorUpdateCount > 0}
							{project.majorUpdateCount}
						{/if}
					</TableBodyCell>

					<!-- Open Issues -->
					<TableBodyCell tdClass="px-6 py-1">
						{#if project.issueCount}
							{project.issueCount}
						{/if}
					</TableBodyCell>

					<!-- GitHub Stars -->
					<TableBodyCell tdClass="px-6 py-1">
						{#if project.gitHubStarCount}
							{project.gitHubStarCount}
						{/if}
					</TableBodyCell>

					<!-- NPM downloads -->
					<TableBodyCell tdClass="px-6 py-1">
						{#if project.npmDownloadCount}
							{project.npmDownloadCount}
						{/if}
					</TableBodyCell>

					<!-- Public -->
					<TableBodyCell tdClass="px-6 py-1">
						{#if project.isPublic}
							✅
						{/if}
					</TableBodyCell>

					<!-- Bare links -->

					<!-- Finder Link -->
					<TableBodyCell tdClass="px-0">
						<a
							class="font-medium text-primary-600 hover:underline dark:text-primary-500"
							href={`file://${project.repositoryPath}`}
							title="Open in Finder"
						>
							<FolderSolid color="red" />
						</a>
					</TableBodyCell>
					<!-- Tower Link -->
					<TableBodyCell tdClass="px-0">
						<a
							class="font-medium text-primary-600 hover:underline dark:text-primary-500"
							href={`gittower://${project.repositoryPath}`}
							title="Open in Tower"
						>
							<ArchiveSolid color="red" />
						</a>
					</TableBodyCell>
					<!-- VS Code Link  -->
					<TableBodyCell tdClass="px-0">
						<a
							class="font-medium text-primary-600 hover:underline dark:text-primary-500"
							href={`vscode://file/${project.repositoryPath}`}
							title="Open in VS Code"
						>
							<FileCodeSolid color="red" />
						</a>
					</TableBodyCell>
					<!-- GitHub -->
					<TableBodyCell tdClass="px-0">
						{#if project.gitHubLink}
							<a
								class="font-medium text-primary-600 hover:underline dark:text-primary-500"
								href={project.gitHubLink}
								title="Open in GitHub"
							>
								<GithubSolid color="red" />
							</a>
						{/if}
					</TableBodyCell>
					<TableBodyCell tdClass="px-0">
						{#if project.isOnNpm}
							<a
								class="font-medium text-primary-600 hover:underline dark:text-primary-500"
								href={`https://www.npmjs.com/package/${project.title}`}
								title="Open in NPM"
							>
								<NpmSolid color="red" />
							</a>
						{/if}
					</TableBodyCell>
				</TableBodyRow>
			{/each}
		</TableBody>
	</Table>
{/key}
