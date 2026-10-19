import type { MetadataGroup } from './workspace.js'
import { request } from './client-request.js'

/** How a repository's group was last requested, keyed by `id:group`. */
export type RequestedMetadata = Map<string, 'background' | 'priority'>

/** One request to the metadata endpoint. */
export type MetadataBatch = { background: boolean; group: MetadataGroup; ids: string[] }

/**
 * Plan metadata requests that load every row, with rows in view (or every row,
 * for groups that filter rules read) ahead of the background queue. Records
 * each planned request in `requested` so later calls send only what changed:
 * new rows, and rows that scroll into view after a background request.
 */
export function planMetadataRequests(options: {
	/** Groups that filter rules read, prioritized for every row. */
	filterGroups: readonly MetadataGroup[]
	groups: Iterable<MetadataGroup>
	/** Every repository ID, in the order background loading should follow. */
	orderedIds: readonly string[]
	requested: RequestedMetadata
	visibleIds: readonly string[]
}): MetadataBatch[] {
	const { filterGroups, groups, orderedIds, requested, visibleIds } = options
	const prioritizedBatches: MetadataBatch[] = []
	const backgroundBatches: MetadataBatch[] = []
	for (const group of groups) {
		const priorityIds = new Set(filterGroups.includes(group) ? orderedIds : visibleIds)
		const prioritized = [...priorityIds].filter(
			(id) => requested.get(`${id}:${group}`) !== 'priority',
		)
		const background = orderedIds.filter(
			(id) => !priorityIds.has(id) && !requested.has(`${id}:${group}`),
		)
		for (const id of prioritized) {
			requested.set(`${id}:${group}`, 'priority')
		}

		for (const id of background) {
			requested.set(`${id}:${group}`, 'background')
		}

		if (prioritized.length > 0) {
			prioritizedBatches.push({ background: false, group, ids: prioritized })
		}

		if (background.length > 0) {
			backgroundBatches.push({ background: true, group, ids: background })
		}
	}

	return [...prioritizedBatches, ...backgroundBatches]
}

/**
 * Send planned batches in order, stopping once the workspace is replaced. A
 * failed batch is reported and the rest are still sent.
 */
export async function sendMetadataRequests(
	workspaceId: string,
	batches: readonly MetadataBatch[],
	options: { isCurrent: () => boolean; onError: (error: unknown) => void },
): Promise<void> {
	for (const { background, group, ids } of batches) {
		try {
			await request('/api/workspace/metadata', {
				background,
				groups: [group],
				repositoryIds: ids,
				workspaceId,
			})
		} catch (error) {
			if (options.isCurrent()) {
				options.onError(error)
			}
		}

		if (!options.isCurrent()) {
			return
		}
	}
}
