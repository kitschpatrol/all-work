import type {
	MetadataEvent,
	MetadataGroups,
	MetadataState,
	MetadataValue,
	Repository,
} from './workspace.js'

function sameValue(a: MetadataValue, b: MetadataValue) {
	return Array.isArray(a) && Array.isArray(b)
		? a.length === b.length && a.every((item, index) => item === b[index])
		: a === b
}

function sameState(a: MetadataState, b: MetadataState) {
	return (
		a.status === b.status &&
		a.cached === b.cached &&
		a.error === b.error &&
		a.updatedAt === b.updatedAt
	)
}

function mergeRecord<T>(
	target: Partial<Record<string, T>>,
	update: Partial<Record<string, T>>,
	same: (a: T, b: T) => boolean,
) {
	for (const key of Object.keys(target)) {
		if (!Object.hasOwn(update, key)) {
			Reflect.deleteProperty(target, key)
		}
	}

	for (const [key, value] of Object.entries(update)) {
		const current = target[key]
		if (value !== undefined && (current === undefined || !same(current, value))) {
			target[key] = value
		}
	}
}

/**
 * Apply a repository's loading states, replacing only the groups whose state
 * changed.
 */
export function mergeGroups(target: Repository, groups: MetadataGroups): void {
	if (target.metadata === undefined) {
		target.metadata = { groups, values: {} }
	} else {
		mergeRecord<MetadataState>(target.metadata.groups, groups, sameState)
	}
}

/**
 * Apply a repository update to the row the page shows, assigning only the
 * fields, values, and loading states that changed. With deeply reactive rows,
 * only what reads a changed field updates.
 */
export function mergeRepository(target: Repository, update: Repository): void {
	const { metadata, ...fields } = update
	if (!('error' in fields)) {
		Reflect.deleteProperty(target, 'error')
	}

	for (const [key, value] of Object.entries(fields)) {
		if (Reflect.get(target, key) !== value) {
			Object.assign(target, { [key]: value })
		}
	}

	if (metadata === undefined) {
		return
	}

	mergeGroups(target, metadata.groups)
	if (target.metadata !== undefined && target.metadata !== metadata) {
		mergeRecord<MetadataValue>(target.metadata.values, metadata.values, sameValue)
	}
}

/**
 * Apply a streamed metadata event to the rows the page shows. A snapshot
 * replaces them. Otherwise repositories deleted from disk are dropped, and
 * changed rows and loading states merge in place.
 *
 * @returns The rows to show: the same array unless the event added or removed
 *   any.
 */
export function applyMetadataEvent(repositories: Repository[], event: MetadataEvent): Repository[] {
	if (event.snapshot) {
		return event.repositories
	}

	const removed = new Set(event.removed)
	const remaining =
		removed.size === 0
			? repositories
			: repositories.filter((repository) => !removed.has(repository.id))
	const rows = new Map(remaining.map((repository) => [repository.id, repository]))
	for (const update of event.repositories) {
		const row = rows.get(update.id)
		if (row !== undefined) {
			mergeRepository(row, update)
		}
	}

	for (const { groups, id } of event.statuses) {
		const row = rows.get(id)
		if (row !== undefined) {
			mergeGroups(row, groups)
		}
	}

	return remaining
}
