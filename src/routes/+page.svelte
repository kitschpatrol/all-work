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

	function formatDate(dateValue: string | Date | undefined): string {
		if (!dateValue) return ''

		const date = new Date(dateValue)
		if (isNaN(date.getTime())) return ''

		return date.toLocaleDateString('en-CA') // en-CA gives YYYY-MM-DD format
	}
</script>

{#key sortUpdateKey}
	<Table>
		<TableHead>
			<TableHeadCell>
				<button
					type="button"
					onclick={() => sortBy('title')}
					class="cursor-pointer bg-transparent border-none p-0 text-left w-full hover:text-primary-600"
				>
					Project {sortIcon('title')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					type="button"
					onclick={() => sortBy('type')}
					class="cursor-pointer bg-transparent border-none p-0 text-left w-full hover:text-primary-600"
				>
					Type {sortIcon('type')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					type="button"
					onclick={() => sortBy('firstCommitDate')}
					class="cursor-pointer bg-transparent border-none p-0 text-left w-full hover:text-primary-600"
				>
					First Commit {sortIcon('firstCommitDate')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					type="button"
					onclick={() => sortBy('lastCommitDate')}
					class="cursor-pointer bg-transparent border-none p-0 text-left w-full hover:text-primary-600"
				>
					Last Commit {sortIcon('lastCommitDate')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					type="button"
					onclick={() => sortBy('gitIsDirty')}
					class="cursor-pointer bg-transparent border-none p-0 text-left w-full hover:text-primary-600"
				>
					Dirty {sortIcon('gitIsDirty')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					type="button"
					onclick={() => sortBy('isRemoteAhead')}
					class="cursor-pointer bg-transparent border-none p-0 text-left w-full hover:text-primary-600"
				>
					Behind {sortIcon('isRemoteAhead')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					type="button"
					onclick={() => sortBy('semverUpdateCount')}
					class="cursor-pointer bg-transparent border-none p-0 text-left w-full hover:text-primary-600"
				>
					Semver Updates {sortIcon('semverUpdateCount')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					type="button"
					onclick={() => sortBy('majorUpdateCount')}
					class="cursor-pointer bg-transparent border-none p-0 text-left w-full hover:text-primary-600"
				>
					Major Updates {sortIcon('majorUpdateCount')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					type="button"
					onclick={() => sortBy('issueCount')}
					class="cursor-pointer bg-transparent border-none p-0 text-left w-full hover:text-primary-600"
				>
					Issues {sortIcon('issueCount')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					type="button"
					onclick={() => sortBy('gitHubStarCount')}
					class="cursor-pointer bg-transparent border-none p-0 text-left w-full hover:text-primary-600"
				>
					Stars {sortIcon('gitHubStarCount')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					type="button"
					onclick={() => sortBy('npmDownloadCount')}
					class="cursor-pointer bg-transparent border-none p-0 text-left w-full hover:text-primary-600"
				>
					Downloads {sortIcon('npmDownloadCount')}
				</button>
			</TableHeadCell>
			<TableHeadCell>
				<button
					type="button"
					onclick={() => sortBy('isPublic')}
					class="cursor-pointer bg-transparent border-none p-0 text-left w-full hover:text-primary-600"
				>
					Public {sortIcon('isPublic')}
				</button>
			</TableHeadCell>

			<TableHeadCell></TableHeadCell>
			<TableHeadCell></TableHeadCell>
			<TableHeadCell></TableHeadCell>
			<TableHeadCell></TableHeadCell>
			<TableHeadCell></TableHeadCell>
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
							class="font-medium text-primary-600 hover:underline dark:text-primary-500"
							href={`file://${project.repositoryPath}`}
							title="Open in Finder"
						>
							<FolderSolid color="red" class="w-5 h-5" />
						</a>
					</TableBodyCell>
					<!-- Tower Link -->
					<TableBodyCell class="px-0">
						<a
							class="font-medium text-primary-600 hover:underline dark:text-primary-500"
							href={`gittower://${project.repositoryPath}`}
							title="Open in Tower"
						>
							<ArchiveSolid color="red" class="w-5 h-5" />
						</a>
					</TableBodyCell>
					<!-- VS Code Link  -->
					<TableBodyCell class="px-0">
						<a
							class="font-medium text-primary-600 hover:underline dark:text-primary-500"
							href={`vscode://file/${project.repositoryPath}`}
							title="Open in VS Code"
						>
							<FileCodeSolid color="red" class="w-5 h-5" />
						</a>
					</TableBodyCell>
					<!-- GitHub -->
					<TableBodyCell class="px-0">
						{#if project.gitHubLink}
							<a
								class="font-medium text-primary-600 hover:underline dark:text-primary-500"
								href={project.gitHubLink}
								title="Open in GitHub"
							>
								<GithubSolid color="red" class="w-5 h-5" />
							</a>
						{/if}
					</TableBodyCell>
					<TableBodyCell class="px-0">
						{#if project.isOnNpm}
							<a
								class="font-medium text-primary-600 hover:underline dark:text-primary-500"
								href={`https://www.npmjs.com/package/${project.title}`}
								title="Open in NPM"
							>
								<NpmSolid color="red" class="w-5 h-5" strokeWidth={0} />
							</a>
						{/if}
					</TableBodyCell>
				</TableBodyRow>
			{/each}
		</TableBody>
	</Table>
{/key}
