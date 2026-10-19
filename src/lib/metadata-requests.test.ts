import { describe, expect, it, vi } from 'vitest'
import type { MetadataBatch, RequestedMetadata } from './metadata-requests.js'
import { request } from './client-request.js'
import { planMetadataRequests, sendMetadataRequests } from './metadata-requests.js'

vi.mock('./client-request.js', () => ({ request: vi.fn() }))

const orderedIds = ['a', 'b', 'c', 'd']

describe('planMetadataRequests', () => {
	it('prioritizes rows in view and queues every other row in the background', () => {
		const requested: RequestedMetadata = new Map()
		expect(
			planMetadataRequests({
				filterGroups: [],
				groups: ['github', 'ci'],
				orderedIds,
				requested,
				visibleIds: ['c'],
			}),
		).toEqual([
			{ background: false, group: 'github', ids: ['c'] },
			{ background: false, group: 'ci', ids: ['c'] },
			{ background: true, group: 'github', ids: ['a', 'b', 'd'] },
			{ background: true, group: 'ci', ids: ['a', 'b', 'd'] },
		])
	})

	it('promotes background rows that scroll into view without repeating other requests', () => {
		const requested: RequestedMetadata = new Map()
		const plan = (visibleIds: string[]) =>
			planMetadataRequests({
				filterGroups: [],
				groups: ['github'],
				orderedIds,
				requested,
				visibleIds,
			})
		plan(['a'])
		expect(plan(['a', 'b'])).toEqual([{ background: false, group: 'github', ids: ['b'] }])
		expect(plan(['b'])).toEqual([])
	})

	it('prioritizes every row for groups that filter rules read', () => {
		expect(
			planMetadataRequests({
				filterGroups: ['registry'],
				groups: ['registry'],
				orderedIds,
				requested: new Map(),
				visibleIds: ['b'],
			}),
		).toEqual([{ background: false, group: 'registry', ids: orderedIds }])
	})

	it('requests rows added after an earlier plan', () => {
		const requested: RequestedMetadata = new Map()
		planMetadataRequests({
			filterGroups: [],
			groups: ['git'],
			orderedIds,
			requested,
			visibleIds: [],
		})
		expect(
			planMetadataRequests({
				filterGroups: [],
				groups: ['git'],
				orderedIds: [...orderedIds, 'e'],
				requested,
				visibleIds: [],
			}),
		).toEqual([{ background: true, group: 'git', ids: ['e'] }])
	})

	it('plans nothing without groups or rows', () => {
		expect(
			planMetadataRequests({
				filterGroups: [],
				groups: [],
				orderedIds,
				requested: new Map(),
				visibleIds: ['a'],
			}),
		).toEqual([])
		expect(
			planMetadataRequests({
				filterGroups: [],
				groups: ['github'],
				orderedIds: [],
				requested: new Map(),
				visibleIds: [],
			}),
		).toEqual([])
	})
})

describe('sendMetadataRequests', () => {
	const batches: MetadataBatch[] = [
		{ background: false, group: 'github', ids: ['a'] },
		{ background: true, group: 'github', ids: ['b'] },
		{ background: true, group: 'ci', ids: ['b'] },
	]

	it('reports a failed batch and still sends the rest', async () => {
		vi.mocked(request).mockReset().mockRejectedValueOnce(new Error('Offline'))
		const onError = vi.fn<(error: unknown) => void>()
		await sendMetadataRequests('workspace', batches, { isCurrent: () => true, onError })
		expect(onError).toHaveBeenCalledExactlyOnceWith(new Error('Offline'))
		expect(vi.mocked(request).mock.calls.map(([, body]) => body)).toEqual([
			{ background: false, groups: ['github'], repositoryIds: ['a'], workspaceId: 'workspace' },
			{ background: true, groups: ['github'], repositoryIds: ['b'], workspaceId: 'workspace' },
			{ background: true, groups: ['ci'], repositoryIds: ['b'], workspaceId: 'workspace' },
		])
	})

	it('stops quietly once the workspace is replaced', async () => {
		let current = true
		vi.mocked(request)
			.mockReset()
			.mockImplementationOnce(() => {
				current = false
				throw new Error('Gone')
			})
		const onError = vi.fn<(error: unknown) => void>()
		await sendMetadataRequests('workspace', batches, { isCurrent: () => current, onError })
		expect(request).toHaveBeenCalledOnce()
		expect(onError).not.toHaveBeenCalled()
	})
})
