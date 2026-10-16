import { describe, expect, it } from 'vitest'
import type { MetadataGroup, MetadataState, Repository } from './workspace.js'
import { pendingMetadata } from './table-formatting.js'

function repository(
	id: string,
	groups?: Partial<Record<MetadataGroup, MetadataState['status']>>,
): Repository {
	return {
		ahead: 0,
		behind: 0,
		branch: 'main',
		changedFiles: 0,
		description: '',
		gitStatusAvailable: true,
		id,
		lastCommit: '',
		lastCommitDate: '',
		...(groups !== undefined && {
			metadata: {
				groups: Object.fromEntries(
					Object.entries(groups).map(([group, status]) => [group, { status }]),
				),
				values: {},
			},
		}),
		name: id,
		packageManager: '',
		path: `/workspace/${id}`,
		relativePath: id,
		remote: '',
		repoName: id,
		repoOwner: '',
		version: '',
	}
}

describe('pending metadata', () => {
	it('counts queued and loading groups and the repositories waiting on them', () => {
		expect(
			pendingMetadata([
				repository('a', { git: 'loading', github: 'queued', local: 'ready' }),
				repository('b', { git: 'queued' }),
				repository('c', { git: 'ready', github: 'error', registry: 'unavailable' }),
			]),
		).toEqual({ groups: 3, repositories: 2 })
	})

	it('treats repositories without metadata and empty workspaces as idle', () => {
		expect(pendingMetadata([repository('a')])).toEqual({ groups: 0, repositories: 0 })
		expect(pendingMetadata([])).toEqual({ groups: 0, repositories: 0 })
	})
})
