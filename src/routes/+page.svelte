<script lang="ts">
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
	import { onMount } from 'svelte'
	import type { PageProps } from './$types'

	const { data }: PageProps = $props()

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

	async function resolveProject(projectPromise: Promise<ProjectType>) {
		try {
			const project = await projectPromise
			resolvedProjects = [...resolvedProjects, project]
			resolvedProjects.sort(compareProjects)
		} catch (error) {
			console.error('Error resolving project:', error)
		}
	}

	onMount(() => {
		for (const projectPromise of data.projects) {
			void resolveProject(projectPromise)
		}
	})

	function sortIcon(key: SortKey) {
		if (sortKey === key) {
			return sortDirection === 'asc' ? '↑' : '↓'
		}

		return ''
	}

	let sortUpdateKey = $derived(`${sortKey}-${sortDirection}`)

	function formatDate(dateValue: Date | string | undefined): string {
		if (dateValue === undefined || dateValue === '') {
			return ''
		}

		const date = new Date(dateValue)
		if (Number.isNaN(date.getTime())) {
			return ''
		}

		return date.toLocaleDateString('en-CA') // Canadian English locale formats dates as YYYY-MM-DD
	}
</script>

{#key sortUpdateKey}
	<Table>
		<TableHead>
			<TableHeadCell>
				<button
					class="hover:text-primary-600 w-full cursor-pointer border-none bg-transparent p-0 text-left"
					onclick={() => sortBy('title')}
					type="button"
				>
					Project {sortIcon('title')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					class="hover:text-primary-600 w-full cursor-pointer border-none bg-transparent p-0 text-left"
					onclick={() => sortBy('type')}
					type="button"
				>
					Type {sortIcon('type')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					class="hover:text-primary-600 w-full cursor-pointer border-none bg-transparent p-0 text-left"
					onclick={() => sortBy('firstCommitDate')}
					type="button"
				>
					First Commit {sortIcon('firstCommitDate')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					class="hover:text-primary-600 w-full cursor-pointer border-none bg-transparent p-0 text-left"
					onclick={() => sortBy('lastCommitDate')}
					type="button"
				>
					Last Commit {sortIcon('lastCommitDate')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					class="hover:text-primary-600 w-full cursor-pointer border-none bg-transparent p-0 text-left"
					onclick={() => sortBy('gitIsDirty')}
					type="button"
				>
					Dirty {sortIcon('gitIsDirty')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					class="hover:text-primary-600 w-full cursor-pointer border-none bg-transparent p-0 text-left"
					onclick={() => sortBy('isRemoteAhead')}
					type="button"
				>
					Behind {sortIcon('isRemoteAhead')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					class="hover:text-primary-600 w-full cursor-pointer border-none bg-transparent p-0 text-left"
					onclick={() => sortBy('semverUpdateCount')}
					type="button"
				>
					Semver Updates {sortIcon('semverUpdateCount')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					class="hover:text-primary-600 w-full cursor-pointer border-none bg-transparent p-0 text-left"
					onclick={() => sortBy('majorUpdateCount')}
					type="button"
				>
					Major Updates {sortIcon('majorUpdateCount')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					class="hover:text-primary-600 w-full cursor-pointer border-none bg-transparent p-0 text-left"
					onclick={() => sortBy('issueCount')}
					type="button"
				>
					Issues {sortIcon('issueCount')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					class="hover:text-primary-600 w-full cursor-pointer border-none bg-transparent p-0 text-left"
					onclick={() => sortBy('gitHubStarCount')}
					type="button"
				>
					Stars {sortIcon('gitHubStarCount')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					class="hover:text-primary-600 w-full cursor-pointer border-none bg-transparent p-0 text-left"
					onclick={() => sortBy('npmDownloadCount')}
					type="button"
				>
					Downloads {sortIcon('npmDownloadCount')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					class="hover:text-primary-600 w-full cursor-pointer border-none bg-transparent p-0 text-left"
					onclick={() => sortBy('isPublic')}
					type="button"
				>
					Public {sortIcon('isPublic')}
				</button>
			</TableHeadCell>

			<TableHeadCell />
			<TableHeadCell />
			<TableHeadCell />
			<TableHeadCell />
			<TableHeadCell />
		</TableHead>
		<TableBody class="divide-y divide-gray-200">
			{#each resolvedProjects as project, index (project.repositoryPath)}
				<TableBodyRow class={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
					<!-- Title -->
					<TableBodyCell class="px-6 py-1 font-bold">
						{project.title}
					</TableBodyCell>

					<!-- Source or Fork -->
					<TableBodyCell class="px-6 py-1">{project.type}</TableBodyCell>

					<!-- First commit -->
					<TableBodyCell class="px-6 py-1">
						{#if project.firstCommitDate !== undefined}
							{formatDate(project.firstCommitDate)}
						{/if}
					</TableBodyCell>

					<!-- Last commit -->
					<TableBodyCell class="px-6 py-1">
						{#if project.lastCommitDate !== undefined}
							{formatDate(project.lastCommitDate)}
						{/if}
					</TableBodyCell>

					<!-- Git clean -->
					<TableBodyCell class="px-6 py-1">
						{#if !project.gitIsClean}
							📝
						{/if}
					</TableBodyCell>

					<!-- Remote ahead -->
					<TableBodyCell class="px-6 py-1">
						{#if project.isRemoteAhead === true}
							📥
						{/if}
					</TableBodyCell>

					<!-- Semver Updates -->
					<TableBodyCell class="px-6 py-1">
						{#if project.semverUpdateCount > 0}
							{project.semverUpdateCount}
						{/if}
					</TableBodyCell>

					<!-- Major Updates -->
					<TableBodyCell class="px-6 py-1">
						{#if project.majorUpdateCount > 0}
							{project.majorUpdateCount}
						{/if}
					</TableBodyCell>

					<!-- Open Issues -->
					<TableBodyCell class="px-6 py-1">
						{#if project.issueCount}
							{project.issueCount}
						{/if}
					</TableBodyCell>

					<!-- GitHub Stars -->
					<TableBodyCell class="px-6 py-1">
						{#if project.gitHubStarCount}
							{project.gitHubStarCount}
						{/if}
					</TableBodyCell>

					<!-- NPM downloads -->
					<TableBodyCell class="px-6 py-1">
						{#if project.npmDownloadCount}
							{project.npmDownloadCount}
						{/if}
					</TableBodyCell>

					<!-- Public -->
					<TableBodyCell class="px-6 py-1">
						{#if project.isPublic}
							✅
						{/if}
					</TableBodyCell>

					<!-- Bare links -->

					<!-- Finder Link -->
					<TableBodyCell class="px-0">
						<a
							class="text-primary-600 dark:text-primary-500 font-medium hover:underline"
							href={`file://${project.repositoryPath}`}
							title="Open in Finder"
						>
							<FolderSolid class="h-5 w-5" color="red" />
						</a>
					</TableBodyCell>
					<!-- Tower Link -->
					<TableBodyCell class="px-0">
						<a
							class="text-primary-600 dark:text-primary-500 font-medium hover:underline"
							href={`gittower://${project.repositoryPath}`}
							title="Open in Tower"
						>
							<ArchiveSolid class="h-5 w-5" color="red" />
						</a>
					</TableBodyCell>
					<!-- VS Code Link  -->
					<TableBodyCell class="px-0">
						<a
							class="text-primary-600 dark:text-primary-500 font-medium hover:underline"
							href={`vscode://file/${project.repositoryPath}`}
							title="Open in VS Code"
						>
							<FileCodeSolid class="h-5 w-5" color="red" />
						</a>
					</TableBodyCell>
					<!-- GitHub -->
					<TableBodyCell class="px-0">
						{#if project.gitHubLink}
							<!-- eslint-disable svelte/no-navigation-without-resolve -- External repository URL, resolve() only applies to internal routes -->
							<a
								class="text-primary-600 dark:text-primary-500 font-medium hover:underline"
								href={project.gitHubLink}
								title="Open in GitHub"
							>
								<GithubSolid class="h-5 w-5" color="red" />
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{/if}
					</TableBodyCell>
					<TableBodyCell class="px-0">
						{#if project.isOnNpm}
							<a
								class="text-primary-600 dark:text-primary-500 font-medium hover:underline"
								href={`https://www.npmjs.com/package/${project.title}`}
								title="Open in NPM"
							>
								<NpmSolid class="h-5 w-5 [&_path]:stroke-0" color="red" />
							</a>
						{/if}
					</TableBodyCell>
				</TableBodyRow>
			{/each}
		</TableBody>
	</Table>
{/key}
