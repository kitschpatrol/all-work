import { execa } from 'execa'
import { globby } from 'globby'
import path from 'node:path'
import * as ncu from 'npm-check-updates'
import { type NormalizedPackageJson, readPackageSync } from 'read-pkg'

export class Project {
	private readonly packageData: NormalizedPackageJson

	constructor(public readonly repositoryPath: string) {
		this.packageData = readPackageSync({
			cwd: repositoryPath,
			normalize: true,
		})
	}

	public async getGitHubInfo(): Promise<
		| {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				open_issues_count: number
				// eslint-disable-next-line @typescript-eslint/naming-convention
				stargazers_count: number
		  }
		| undefined
	> {
		const author = 'kitschpatrol'
		const repo = this.packageData.name.replace('@kitschpatrol/', '')
		// eslint-disable-next-line n/no-unsupported-features/node-builtins
		const result = await fetch(`https://api.github.com/repos/${author}/${repo}`)
		const json = (await result.json()) as {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			open_issues_count: number
			// eslint-disable-next-line @typescript-eslint/naming-convention
			stargazers_count: number
			status: string | undefined
		}

		if (json.status !== undefined && json.status === '404') {
			return undefined
		}

		return {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			open_issues_count: json.open_issues_count,
			// eslint-disable-next-line @typescript-eslint/naming-convention
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

	public async getNpmDownloadCount(): Promise<number> {
		// eslint-disable-next-line n/no-unsupported-features/node-builtins
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

	public async getOutdatedPackageList(
		mode:
			| 'default'
			| 'latest'
			| 'major'
			| 'minor'
			| 'newest'
			| 'next'
			| 'patch'
			| undefined = undefined,
	): Promise<string[]> {
		if (mode !== undefined) {
			console.log(`Mode not yet implemented`)
		}

		try {
			const results = await ncu.run({
				cache: true,
				cwd: this.repositoryPath,
				pre: false,
				target: 'greatest',
				upgrade: false,
				workspaces: this.packageData.workspaces !== undefined,
			})

			if (typeof results !== 'object') {
				return []
			}

			const updateSet = new Set<string>()
			for (const value of Object.values(results)) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				for (const [key2, value2] of Object.entries(value)) {
					// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
					updateSet.add(`${key2}: ${value2}`)
				}
			}

			return [...updateSet]
		} catch (error) {
			console.error('Error getting outdated packages:', error)
			return [] // Return empty array in case of an error
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
				let remoteBranch = ''
				for (const branch of [currentBranch, 'main', 'master', 'dev']) {
					const { exitCode } = await execa(
						'git',
						['ls-remote', '--exit-code', '--heads', remote, branch],
						{ cwd: this.repositoryPath, reject: false },
					)
					if (exitCode === 0) {
						remoteBranch = branch
						break
					}
				}

				if (!remoteBranch) {
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

				results[remote] = behind - ahead
			} catch (error) {
				console.error(`Error processing remote ${remote}:`, error)
			}
		}

		return results
	}

	public async getStarCount(): Promise<number> {
		const info = await this.getGitHubInfo()

		if (info === undefined) {
			return 0
		}

		return info.stargazers_count
	}

	public async getTableRow() {
		const outdatedPackageList: string[] = await this.getOutdatedPackageList()
		const gitIsClean = await this.getGitIsClean()
		const isRemoteAheadInitial = await this.isRemoteAhead()

		const gitHubInfo = await this.getGitHubInfo()
		const issueCount =
			gitHubInfo !== undefined && this.isOnMyGitHub ? gitHubInfo?.open_issues_count : undefined
		const starCount =
			gitHubInfo !== undefined && this.isOnMyGitHub ? gitHubInfo?.stargazers_count : undefined
		const npmDownloadCount =
			this.isOnMyGitHub && this.isOnNpm ? await this.getNpmDownloadCount() : undefined

		const isPublic = this.isOnMyGitHub && gitHubInfo !== undefined

		return {
			gitHubLink: this.gitHubLink,
			gitHubStarCount: starCount,
			gitIsClean,
			gitIsDirty: !gitIsClean,
			gitRemoteCount: await this.getGitRemoteCount(),
			isAuthoredByMe: this.isAuthoredByMe,
			isOnMyGitHub: this.isOnMyGitHub,
			isOnNpm: this.isOnNpm,
			isPublic,
			isRemoteAhead: this.status === 'fork' ? isRemoteAheadInitial : undefined,
			issueCount,
			npmDownloadCount,
			outdatedPackageCount: outdatedPackageList.length,
			outdatedPackageList,
			repositoryPath: this.repositoryPath,
			title: this.title,
			type: this.status,
			usesPnpm: this.usesPnpm,
			usesSharedConfig: this.usesSharedConfig,
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
		return this.packageData.repository?.url?.toLowerCase().includes('kitschpatrol') ?? false
	}

	public get isOnNpm(): boolean {
		return this.packageData.publishConfig?.access === 'public'
	}

	public get status(): 'fork' | 'source' | 'unmaintained' {
		return !this.isAuthoredByMe && this.isOnMyGitHub
			? 'fork'
			: this.isAuthoredByMe
				? 'source'
				: 'unmaintained'
	}

	public get title(): string {
		return this.packageData.name ?? path.basename(this.repositoryPath)
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
}

export async function getProjectPaths(
	projectsDirectory: string,
	extraProjectPaths: string[] = [],
): Promise<string[]> {
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

	return allProjectPaths
}

export async function getProjects(
	projectsDirectory: string,
	extraProjectPaths: string[] = [],
): Promise<Project[]> {
	const allProjectPaths = await getProjectPaths(projectsDirectory, extraProjectPaths)

	const projects: Project[] = []

	for (const repositoryPath of allProjectPaths) {
		projects.push(new Project(repositoryPath))
	}

	return projects
}
