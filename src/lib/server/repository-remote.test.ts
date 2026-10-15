import { describe, expect, it } from 'vitest'
import { getRemoteRepository } from './repository-remote.js'

describe('remote repository identity', () => {
	it.each([
		'https://github.com/team/project.git',
		'https://username:secret@github.com/team/project.git/?token=secret',
		'git@github.com:team/project.git',
		'ssh://git@github.com:22/team/project.git',
		'git://github.com/team/project.git',
		'https://git.example.com/team/project.git',
	])('extracts the namespace without credentials from %s', (remote) => {
		expect(getRemoteRepository(remote)).toEqual({ name: 'project', owner: 'team' })
	})

	it('preserves nested namespaces', () => {
		expect(getRemoteRepository('ssh://git@gitlab.com:2222/team/subgroup/project.git')).toEqual({
			name: 'project',
			owner: 'team/subgroup',
		})
	})

	it.each([
		'',
		'not a remote',
		'/tmp/team/project.git',
		'file:///tmp/team/project.git',
		'https://github.com/team/%ZZ.git',
	])('leaves the owner unset for local or invalid remote %s', (remote) =>
		expect(getRemoteRepository(remote)).toBeUndefined(),
	)
})
