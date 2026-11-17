import type { MetadataContext } from 'metascope'
import { sourceNames } from 'metascope'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Repository } from '../workspace.js'
import { getForkComparisonLinks } from './fork-links.js'
import { updateGitColumnLinks } from './git-column-links.js'
import { git as runGit } from './git-command.js'

let directory: string
let first: string
let head: string
let repository: Repository

async function git(args: string[]) {
	return runGit(directory, args)
}

beforeEach(async () => {
	directory = await mkdtemp(path.join(os.tmpdir(), 'all-work-links-'))
	await git(['init', '-b', 'main'])
	await git(['config', 'user.name', 'Fixture'])
	await git(['config', 'user.email', 'fixture@example.com'])
	await git(['-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'First'])
	first = await git(['rev-parse', 'HEAD'])
	await git(['remote', 'add', 'origin', 'git@github.com:team/project.git'])
	await git(['update-ref', 'refs/remotes/origin/main', first])
	await git(['checkout', '-b', 'feature/links'])
	await git(['-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Second'])
	head = await git(['rev-parse', 'HEAD'])
	await git(['update-ref', 'refs/remotes/origin/feature/links', head])
	repository = {
		ahead: 1,
		behind: 0,
		branch: 'feature/links',
		changedFiles: 0,
		description: '',
		gitStatusAvailable: true,
		id: 'fixture',
		lastCommit: 'Second',
		lastCommitDate: '',
		metadata: { groups: {}, values: { 'Git Commits': 2 } },
		name: 'fixture',
		packageManager: '',
		path: directory,
		readme: '',
		relativePath: 'fixture',
		remote: 'git@github.com:team/project.git',
		repoName: 'project',
		repoOwner: 'team',
		upstream: 'origin/main',
		upstreamGone: false,
		version: '',
		website: '',
	}
})

afterEach(async () => {
	await rm(directory, { force: true, recursive: true })
})

describe('published Git column links', () => {
	it('uses exact published commits and direction-correct comparisons', async () => {
		await updateGitColumnLinks(repository, head, git)
		expect(repository.metadata?.links).toMatchObject({
			ahead: [`https://github.com/team/project/compare/${first}...${head}`],
			behind: [`https://github.com/team/project/compare/${head}...${first}`],
			'First Commit Date': [`https://github.com/team/project/commit/${first}`],
			'Git Commits': [`https://github.com/team/project/commits/${head}`],
			'Latest Commit Date': [`https://github.com/team/project/commit/${head}`],
		})
		expect(repository.metadata?.links?.['Git Current Branch']).toBeUndefined()
	})

	it('removes stale links after an unpublished commit and after remote refs disappear', async () => {
		await updateGitColumnLinks(repository, head, git)
		await git(['-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Unpublished'])
		await updateGitColumnLinks(repository, await git(['rev-parse', 'HEAD']), git)
		expect(repository.metadata?.links?.['Latest Commit Date']).toBeUndefined()
		expect(repository.metadata?.links?.['Git Commits']).toBeUndefined()
		expect(repository.metadata?.links?.ahead).toBeUndefined()
		expect(repository.metadata?.links?.['First Commit Date']).toEqual([
			`https://github.com/team/project/commit/${first}`,
		])
		await git(['update-ref', '-d', 'refs/remotes/origin/main'])
		await git(['update-ref', '-d', 'refs/remotes/origin/feature/links'])
		await updateGitColumnLinks(repository, head, git)
		expect(repository.metadata?.links?.['Git Current Branch']).toBeUndefined()
		expect(repository.metadata?.links?.['First Commit Date']).toBeUndefined()
	})

	it('opens a known submodule manifest as a local file', async () => {
		await writeFile(path.join(directory, '.gitmodules'), '[submodule "library"]\npath = library\n')
		if (repository.metadata !== undefined) {
			repository.metadata.values['Git Submodules'] = 1
		}

		await updateGitColumnLinks(repository, head, git)
		expect(repository.metadata?.links?.['Git Submodules']).toEqual([
			new URL('.gitmodules', `file://${directory}/`).href,
		])
	})

	it('uses known parent and fork defaults, including renamed forks, and skips unknown parents', async () => {
		const context = Object.assign(
			Object.fromEntries(sourceNames.map((name) => [name, undefined])),
			{
				github: {
					data: {
						defaultBranch: 'feature/links',
						forkedFrom: 'https://github.com/upstream/original',
					},
					source: 'github',
				},
			},
		) as MetadataContext
		const unavailable = await getForkComparisonLinks(directory, repository.remote, context)
		expect(unavailable['Fork Ahead']).toBeUndefined()
		await git(['remote', 'add', 'parent', 'git@github.com:upstream/original.git'])
		await git(['update-ref', 'refs/remotes/parent/trunk', first])
		await git(['symbolic-ref', 'refs/remotes/parent/HEAD', 'refs/remotes/parent/trunk'])
		expect(await getForkComparisonLinks(directory, repository.remote, context)).toEqual({
			'Fork Ahead': [
				'https://github.com/team/project/compare/upstream:original:trunk...team:project:feature%2Flinks',
			],
			'Fork Behind': [
				'https://github.com/team/project/compare/team:project:feature%2Flinks...upstream:original:trunk',
			],
		})
	})
})
