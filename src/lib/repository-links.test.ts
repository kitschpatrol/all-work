import { describe, expect, it, vi } from 'vitest'
import type { NativeOpenTarget } from './repository-links.js'
import type { Repository } from './workspace.js'
import { getGithubUrl, getWebsiteUrl, openRepositories } from './repository-links.js'

describe('GitHub repository links', () => {
	it.each([
		'https://github.com/team/project.git',
		'https://username:secret@github.com/team/project.git/?token=secret',
		'git@github.com:team/project.git',
		'ssh://git@github.com:22/team/project.git',
		'git://github.com/team/project.git',
	])('opens the browser repository for %s without passing credentials', (remote) => {
		expect(getGithubUrl(remote)).toBe('https://github.com/team/project')
	})
	it.each([
		'',
		'not a remote',
		'https://gitlab.com/team/project.git',
		'https://github.com.example.com/team/project.git',
		'https://github.com/team',
	])('does not offer a GitHub link for %s', (remote) => {
		expect(getGithubUrl(remote)).toBeUndefined()
	})
})

describe('repository website links', () => {
	const repositoryUrl = 'https://github.com/team/project'

	it.each([
		['https://example.com/docs', 'https://example.com/docs'],
		['  example.com  ', 'https://example.com/'],
		['https://example.com/', 'https://example.com/'],
		['https://team.github.io/project/', 'https://team.github.io/project/'],
		['https://github.com/team/other', 'https://github.com/team/other'],
	])('opens the distinct website %s', (website, expected) => {
		expect(getWebsiteUrl(website, repositoryUrl)).toBe(expected)
	})

	it.each([
		repositoryUrl,
		'https://github.com/TEAM/Project/',
		'https://github.com/team/project.git/?tab=readme#readme',
		'github.com/team/project',
	])('disables a website pointing back to the same GitHub page: %s', (website) => {
		expect(getWebsiteUrl(website, repositoryUrl)).toBeUndefined()
	})

	it.each([
		undefined,
		'',
		'  ',
		'not a URL',
		// eslint-disable-next-line no-script-url -- Verify that website metadata cannot produce a script link.
		'javascript:alert(1)',
		'file:///tmp/project',
	])('disables a missing or invalid website: %s', (website) => {
		expect(getWebsiteUrl(website, repositoryUrl)).toBeUndefined()
	})
})

describe('opening selected repositories', () => {
	const base: Repository = {
		ahead: 0,
		behind: 0,
		branch: 'main',
		changedFiles: 0,
		description: '',
		gitStatusAvailable: true,
		id: '',
		lastCommit: '',
		lastCommitDate: '',
		name: '',
		packageManager: '',
		path: '',
		readme: '',
		relativePath: '',
		remote: '',
		repoName: '',
		repoOwner: '',
		upstream: '',
		upstreamGone: false,
		version: '',
		website: '',
	}

	it('opens readmes in order and skips repositories without one', async () => {
		const openInApp = vi.fn<(repository: Repository, app: NativeOpenTarget) => Promise<void>>()
		openInApp.mockResolvedValue()
		const repositories = [
			{ ...base, id: 'a', readme: 'readme.md' },
			{ ...base, id: 'b' },
			{ ...base, id: 'c', readme: 'README' },
		]
		await openRepositories(repositories, 'readme', openInApp)
		expect(openInApp.mock.calls.map(([repository]) => repository.id)).toEqual(['a', 'c'])
		openInApp.mockClear()
		await openRepositories(repositories, 'finder', openInApp)
		expect(openInApp).toHaveBeenCalledTimes(3)
	})
})
