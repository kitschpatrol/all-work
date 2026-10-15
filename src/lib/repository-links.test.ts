import { describe, expect, it } from 'vitest'
import { getGithubUrl } from './repository-links.js'

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
