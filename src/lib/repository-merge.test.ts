/* eslint-disable ts/naming-convention -- Frontmatter keys preserve the Metascope template spelling. */
import { describe, expect, it } from 'vitest'
import type { Repository } from './workspace.js'
import { mergeGroups, mergeRepository } from './repository-merge.js'

function repository(overrides: Partial<Repository> = {}): Repository {
	return {
		ahead: 0,
		behind: 0,
		branch: 'main',
		changedFiles: 0,
		description: '',
		gitStatusAvailable: true,
		id: 'a',
		lastCommit: '',
		lastCommitDate: '',
		metadata: {
			groups: { git: { status: 'ready', updatedAt: '2026-10-28T00:00:00.000Z' } },
			values: { Tags: ['one', 'two'], Version: '1.0.0' },
		},
		name: 'a',
		packageManager: '',
		path: '/workspace/a',
		readme: '',
		relativePath: 'a',
		remote: '',
		repoName: 'a',
		repoOwner: '',
		upstream: '',
		upstreamGone: false,
		version: '',
		website: '',
		...overrides,
	}
}

describe('repository merge', () => {
	it('assigns changed fields and keeps equal values, lists, and states in place', () => {
		const target = repository()
		const { groups, values } = target.metadata ?? { groups: {}, values: {} }
		const tags = values.Tags
		const { git } = groups
		mergeRepository(
			target,
			repository({
				branch: 'next',
				metadata: {
					groups: { git: { status: 'ready', updatedAt: '2026-10-28T00:00:00.000Z' } },
					values: { Tags: ['one', 'two'], Version: '2.0.0' },
				},
			}),
		)
		expect(target.branch).toBe('next')
		expect(target.metadata?.values.Version).toBe('2.0.0')
		expect(target.metadata?.values.Tags).toBe(tags)
		expect(target.metadata?.groups.git).toBe(git)
		expect(target.metadata?.groups).toBe(groups)
	})

	it('replaces changed lists and states', () => {
		const target = repository()
		mergeRepository(
			target,
			repository({
				metadata: {
					groups: { git: { cached: true, status: 'loading' } },
					values: { Tags: ['one'], Version: '1.0.0' },
				},
			}),
		)
		expect(target.metadata).toEqual({
			groups: { git: { cached: true, status: 'loading' } },
			values: { Tags: ['one'], Version: '1.0.0' },
		})
	})

	it('removes an error, values, and groups the update no longer has', () => {
		const target = repository({ error: 'Failed' })
		mergeRepository(target, repository({ metadata: { groups: {}, values: { Version: '1.0.0' } } }))
		expect(target).not.toHaveProperty('error')
		expect(target.metadata).toEqual({ groups: {}, values: { Version: '1.0.0' } })
	})

	it('applies loading states alone, leaving values untouched', () => {
		const target = repository()
		const values = target.metadata?.values
		mergeGroups(target, { git: { status: 'queued' }, local: { status: 'loading' } })
		expect(target.metadata?.groups).toEqual({
			git: { status: 'queued' },
			local: { status: 'loading' },
		})
		expect(target.metadata?.values).toBe(values)
	})

	it('starts metadata for a row without any', () => {
		const target = repository({ metadata: undefined })
		mergeGroups(target, { local: { status: 'queued' } })
		expect(target.metadata).toEqual({ groups: { local: { status: 'queued' } }, values: {} })
		const next = repository({ metadata: undefined })
		mergeRepository(next, repository())
		expect(next.metadata?.values.Version).toBe('1.0.0')
	})
})
