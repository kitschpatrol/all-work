/* eslint-disable ts/naming-convention */
import { execa } from 'execa'
import { globby } from 'globby'
// Maybe later
// import hostedGitInfo from 'hosted-git-info'
import type { NormalizedPackageJson } from 'read-pkg'
import path from 'node:path'
import { readPackageSync } from 'read-pkg'
import { CheckPackages } from 'taze'
import { z } from 'zod'

// Future structure
// path
// package
// github
// git
// npm

// Maybe later
// type HostedGitInfo = ReturnType<typeof hostedGitInfo.fromUrl>

/**
 * Zod schema for getProjectMetadata return type
 *
 * @public
 */
export const ProjectMetadataSchema = z.object({
	description: z.string().optional(),
	firstCommitDate: z.date().optional(),
	gitHubLink: z.string().optional(),
	gitHubStarCount: z.number().optional(),
	gitIsClean: z.boolean(),
	gitIsDirty: z.boolean(),
	gitRemoteCount: z.number(),
	homepage: z.string().optional(),
	isAuthoredByMe: z.boolean(),
	isOnMyGitHub: z.boolean(),
	isOnNpm: z.boolean(),
	isPublic: z.boolean(),
	isRemoteAhead: z.boolean().optional(),
	issueCount: z.number().optional(),
	lastCommitDate: z.date().optional(),
	license: z.string().optional(),
	majorUpdateCount: z.number(),
	majorUpdateList: z.array(z.string()),
	npmDownloadCount: z.number().optional(),
	readmePath: z.string().optional(),
	repositoryPath: z.string(),
	semverUpdateCount: z.number(),
	semverUpdateList: z.array(z.string()),
	tags: z.array(z.string()).optional(),
	title: z.string(),
	type: z.enum(['fork', 'source', 'unmaintained']),
	usesPnpm: z.boolean(),
	usesSharedConfig: z.boolean(),
	version: z.string().optional(),
})

/**
 * @public
 */
export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>

export class Project {
	public readonly repositoryPath: string

	public get gitHubLink(): string | undefined {
		return this.packageData.repository?.url.replace('git+', '').replace('.git', '')
	}

	public get isAuthoredByMe(): boolean {
		return (
			this.packageData.author?.name?.toLowerCase().includes('eric mika') ??
			this.packageData.author?.name?.toLowerCase().includes('kitschpatrol') ??
			false
		)
	}

	public get isOnMyGitHub(): boolean {
		return this.packageData.repository?.url.toLowerCase().includes('kitschpatrol') ?? false
	}

	public get isOnNpm(): boolean {
		return this.packageData.publishConfig?.access === 'public'
	}

	public get package(): NormalizedPackageJson {
		return this.packageData
	}

	public get status(): 'fork' | 'source' | 'unmaintained' {
		return !this.isAuthoredByMe && this.isOnMyGitHub
			? 'fork'
			: this.isAuthoredByMe
				? 'source'
				: 'unmaintained'
	}

	public get title(): string {
		return this.packageData.name
	}

	public get usesPnpm(): boolean {
		return (
			this.packageData.packageManager?.toLowerCase().startsWith('pnpm') ??
			Object.hasOwn(this.packageData.engines ?? {}, 'pnpm')
		)
	}

	public get usesSharedConfig(): boolean {
		return Object.hasOwn(this.packageData.devDependencies ?? {}, '@kitschpatrol/shared-config')
	}

	// Maybe later
	// private readonly gitInfo: HostedGitInfo
	private readonly packageData: NormalizedPackageJson

	constructor(repositoryPath: string) {
		this.repositoryPath = repositoryPath
		this.packageData = readPackageSync({
			cwd: repositoryPath,
			normalize: true,
		})

		// Maybe later
		// this.gitInfo = hostedGitInfo.fromUrl(this.packageData.repository?.url ?? '')
	}

	public async getFirstCommitDate(): Promise<Date | undefined> {
		try {
			const { stdout: firstCommitDateString } = await execa(
				'git',
				['log', '--reverse', '--format=%cd', '-n', '1'],
				{
					cwd: this.repositoryPath,
				},
			)
			return firstCommitDateString === '' ? undefined : new Date(firstCommitDateString)
		} catch (error) {
			console.error('Error getting first commit date:', error)
			return undefined
		}
	}

	public async getGitHubInfo(): Promise<
		| undefined
		| {
				open_issues_count: number
				stargazers_count: number
		  }
	> {
		const author = 'kitschpatrol'
		const repository = this.packageData.name.replace('@kitschpatrol/', '')
		const result = await fetch(`https://api.github.com/repos/${author}/${repository}`)

		const json = (await result.json()) as {
			open_issues_count: number
			stargazers_count: number
			status: string | undefined
		}

		if (json.status !== undefined && json.status === '404') {
			return undefined
		}

		return {
			open_issues_count: json.open_issues_count,
			stargazers_count: json.stargazers_count,
		}
	}

	public async getGitIsClean(): Promise<boolean> {
		const { stdout: gitStatus } = await execa('git', ['status', '--porcelain'], {
			cwd: this.repositoryPath,
		})
		return gitStatus.length === 0
	}

	public async getGitRemoteCount(): Promise<number> {
		try {
			// Run 'git remote' command to list all remotes
			const { stdout } = await execa('git', ['remote'], {
				cwd: this.repositoryPath,
			})

			// Split the output by newline and filter out any empty lines
			const remotes = stdout.split('\n').filter((remote) => remote.trim() !== '')

			// Return the count of remotes
			return remotes.length
		} catch (error) {
			console.error('Error getting git remotes:', error)
			return 0 // Return 0 in case of an error
		}
	}

	public async getLastCommitDate(): Promise<Date | undefined> {
		try {
			const { stdout: lastCommitDateString } = await execa('git', ['log', '-1', '--format=%cd'], {
				cwd: this.repositoryPath,
			})
			return lastCommitDateString === '' ? undefined : new Date(lastCommitDateString)
		} catch (error) {
			console.error('Error getting last commit date:', error)
			return undefined
		}
	}

	public async getNpmDownloadCount(): Promise<number> {
		const result = await fetch(
			`https://api.npmjs.org/downloads/point/1970-01-01:3000-01-01/${this.packageData.name}`,
		)

		const json = (await result.json()) as {
			downloads: number
			end: string
			package: string
			start: string
		}

		return json.downloads
	}

	public async getProjectMetadata(): Promise<ProjectMetadata> {
		const semverUpdateList: string[] = await this.getUpdateList('default')
		const firstCommitDate = await this.getFirstCommitDate()
		const lastCommitDate = await this.getLastCommitDate()
		const majorUpdateList: string[] = await this.getUpdateList('major')
		const gitIsClean = await this.getGitIsClean()
		const isRemoteAheadInitial = await this.isRemoteAhead()
		const readmePath = await this.getReadmePath()

		const gitHubInfo = await this.getGitHubInfo()
		const issueCount =
			gitHubInfo !== undefined && this.isOnMyGitHub ? gitHubInfo.open_issues_count : undefined
		const starCount =
			gitHubInfo !== undefined && this.isOnMyGitHub ? gitHubInfo.stargazers_count : undefined
		const npmDownloadCount =
			this.isOnMyGitHub && this.isOnNpm ? await this.getNpmDownloadCount() : undefined

		const isPublic = this.isOnMyGitHub && gitHubInfo !== undefined

		const projectMetadata = {
			description: this.packageData.description,
			firstCommitDate,
			gitHubLink: this.gitHubLink,
			gitHubStarCount: starCount,
			gitIsClean,
			gitIsDirty: !gitIsClean,
			gitRemoteCount: await this.getGitRemoteCount(),
			homepage: this.packageData.homepage,
			isAuthoredByMe: this.isAuthoredByMe,
			isOnMyGitHub: this.isOnMyGitHub,
			isOnNpm: this.isOnNpm,
			isPublic,
			isRemoteAhead: this.status === 'fork' ? isRemoteAheadInitial : undefined,
			issueCount,
			lastCommitDate,
			license: this.packageData.license,
			majorUpdateCount: majorUpdateList.length - semverUpdateList.length,
			majorUpdateList,
			npmDownloadCount,
			readmePath,
			repositoryPath: this.repositoryPath,
			semverUpdateCount: semverUpdateList.length,
			semverUpdateList,
			tags: this.packageData.keywords,
			title: this.title,
			type: this.status,
			usesPnpm: this.usesPnpm,
			usesSharedConfig: this.usesSharedConfig,
			version: this.packageData.version,
		}

		return ProjectMetadataSchema.parse(projectMetadata)
	}

	public async getReadmePath(): Promise<string | undefined> {
		try {
			// Look for readme files using case-insensitive search
			const readmeFiles = await globby(['readme.md', 'readme', 'readme.txt'], {
				absolute: true,
				caseSensitiveMatch: false,
				cwd: this.repositoryPath,
			})

			// Return the first match found, or undefined if none found
			return readmeFiles[0]
		} catch {
			return undefined
		}
	}

	public async getRemoteStatus(skipOrigin = true): Promise<Record<string, number>> {
		// Get the current branch name
		const { stdout: currentBranch } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
			cwd: this.repositoryPath,
		})

		// Get all remotes
		const { stdout: remotesOutput } = await execa('git', ['remote'], {
			cwd: this.repositoryPath,
		})
		const remotes = remotesOutput.split('\n').filter(Boolean)

		const results: Record<string, number> = {}

		for (const remote of remotes) {
			// Skip the 'origin' remote if skipOrigin is true
			if (skipOrigin && remote === 'origin') {
				continue
			}

			try {
				// Fetch the latest from the remote
				await execa('git', ['fetch', remote], { cwd: this.repositoryPath })

				// Try to find the matching remote branch
				const remoteBranch = await this.findRemoteBranch(remote, currentBranch)

				if (remoteBranch === undefined) {
					console.warn(`No matching branch found for remote "${remote}" in ${this.repositoryPath}`)
					continue
				}

				// Get the number of commits ahead/behind
				const { stdout } = await execa(
					'git',
					['rev-list', '--left-right', '--count', `HEAD...${remote}/${remoteBranch}`],
					{ cwd: this.repositoryPath },
				)
				const [ahead, behind] = stdout.split('\t').map(Number)
				if (ahead === undefined || behind === undefined) {
					throw new Error(`Unexpected "git rev-list --count" output: "${stdout}"`)
				}

				results[remote] = behind - ahead
			} catch (error) {
				console.error(`Error processing remote ${remote}:`, error)
			}
		}

		return results
	}

	public async getStarCount(): Promise<number> {
		const info = await this.getGitHubInfo()

		return info === undefined ? 0 : info.stargazers_count
	}

	public async getUpdateList(
		mode: 'default' | 'latest' | 'major' | 'minor' | 'newest' | 'next' | 'patch' = 'default',
	): Promise<string[]> {
		// Via Taze

		try {
			// eslint-disable-next-line new-cap
			const checked = await CheckPackages({
				cwd: this.repositoryPath,
				force: true,
				githubActions: false,
				mode,
				nodeVersion: false,
				recursive: true,
			})

			const results: string[] = []

			for (const pkg of checked.packages) {
				for (const resolved of pkg.resolved) {
					if (resolved.update) {
						results.push(
							`${resolved.name}: ${resolved.currentVersion} -> ${resolved.targetVersion}`,
						)
					}
				}
			}

			return results
		} catch (error) {
			console.error(`Error getting package update list for "${this.repositoryPath}"`, error)
			return []
		}
	}

	public async isPublic(): Promise<boolean> {
		const info = await this.getGitHubInfo()
		return info !== undefined
	}

	public async isRemoteAhead(): Promise<boolean> {
		const forkStatus = await this.getRemoteStatus()
		return Object.values(forkStatus).some((value) => value > 0)
	}

	private async findRemoteBranch(
		remote: string,
		currentBranch: string,
	): Promise<string | undefined> {
		for (const branch of [currentBranch, 'main', 'master', 'dev']) {
			const { exitCode } = await execa(
				'git',
				['ls-remote', '--exit-code', '--heads', remote, branch],
				{ cwd: this.repositoryPath, reject: false },
			)
			if (exitCode === 0) {
				return branch
			}
		}

		return undefined
	}
}

/**
 * Options for getProjectPaths function
 */
export type ProjectPathOptions = {
	excludedProjectPaths?: string[]
	extraProjectPaths?: string[]
	projectsDirectory?: string
}

/**
 * Get the paths of all projects in the projects directory
 */
async function getProjectPaths(options: ProjectPathOptions): Promise<string[]> {
	const { excludedProjectPaths = [], extraProjectPaths = [], projectsDirectory = '.' } = options
	const projectsDirectoryPackageJsonPaths = await globby(
		path.join(projectsDirectory, '*/package.json'),
		{
			absolute: true,
		},
	)
	const projectsDirectoryProjectPaths = projectsDirectoryPackageJsonPaths.map((packageJsonPath) =>
		path.dirname(packageJsonPath),
	)

	// Unique project paths
	const allProjectPaths = [...new Set([...extraProjectPaths, ...projectsDirectoryProjectPaths])]

	// Filter out excluded project paths
	const filteredProjectPaths = allProjectPaths.filter(
		(projectPath) => !excludedProjectPaths.includes(projectPath),
	)

	return filteredProjectPaths
}

/**
 * Get all projects in the projects directory
 *
 * @public
 */
export async function getProjects(
	projectsDirectory: string,
	extraProjectPaths: string[] = [],
): Promise<Project[]> {
	const allProjectPaths = await getProjectPaths({
		extraProjectPaths,
		projectsDirectory,
	})

	const projects: Project[] = Array.from(
		allProjectPaths,
		(repositoryPath) => new Project(repositoryPath),
	)

	return projects
}

/**
 * Get all Eric projects as lazily resolved project classes
 *
 * @public
 */
export async function getEricProjects(options?: ProjectPathOptions): Promise<Project[]> {
	const defaultEricProjectPathOptions: ProjectPathOptions = {
		// Exclusions
		excludedProjectPaths: [
			'/Users/mika/Code/eleventy-plugin-syntaxhighlight',
			'/Users/mika/Code/parcel-optimizer-friendly-urls',
			'/Users/mika/Code/eleventy-plugin-parcel-test',
			'/Users/mika/Code/tp-test-astro',
		],
		// Any extra repos not detected by getProjectPaths filters...
		extraProjectPaths: [
			'/Users/mika/Notes',
			'/opt/homebrew/Library/Taps/kitschpatrol/homebrew-tap',
			'/Users/mika/.local/share/chezmoi',
		],
		projectsDirectory: '/Users/mika/Code/',
	}

	const resolvedProjectPathOptions = Object.assign(defaultEricProjectPathOptions, options)

	const projectPaths = await getProjectPaths(resolvedProjectPathOptions)

	const projects = projectPaths
		.map((projectPath) => new Project(projectPath))
		.filter((project) => project.status !== 'unmaintained')

	return projects
}

/**
 * Get all Eric projects as POJOs (ProjectMetadata objects) Optionally override
 * default paths
 *
 * @public
 */
export async function getEricProjectsAsProjectMetadata(
	options?: ProjectPathOptions,
): Promise<ProjectMetadata[]> {
	const projects = await getEricProjects(options)
	return Promise.all(projects.map(async (project) => project.getProjectMetadata()))
}
