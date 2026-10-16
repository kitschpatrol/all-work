import type { CommandRun, Repository } from './workspace.js'
import { formatColumnCellValue } from './column-variables.js'

/** Format the latest commit date for a compact table cell. */
export function formatDate(value: string) {
	return value === ''
		? 'No commits'
		: new Date(value).toLocaleDateString(undefined, {
				day: 'numeric',
				month: 'short',
				year: 'numeric',
			})
}

/** Build a VS Code link with encoded directory segments. */
export function vscodeUrl(repositoryPath: string) {
	const normalized = repositoryPath.replaceAll('\\', '/')
	const absolute = normalized.startsWith('/') ? normalized : `/${normalized}`
	const encoded = absolute
		.split('/')
		.map((segment) => encodeURIComponent(segment))
		.join('/')
	return `vscode://file${encoded}/`
}

/** Format the count of repositories whose command has finished. */
export function runProgress(run: CommandRun) {
	const results = Object.values(run.results)
	return `${results.filter((result) => result.status !== 'queued' && result.status !== 'running').length}/${results.length}`
}

/**
 * Count the metadata groups still queued or loading, and the repositories
 * waiting on them.
 */
export function pendingMetadata(repositories: readonly Repository[]) {
	let groups = 0
	let waiting = 0
	for (const repository of repositories) {
		const count = Object.values(repository.metadata?.groups ?? {}).filter(
			(state) => state.status === 'queued' || state.status === 'loading',
		).length
		groups += count
		if (count > 0) {
			waiting++
		}
	}

	return { groups, repositories: waiting }
}

/** Format the displayed cell text for inexpensive width measurement. */
export function getColumnSizingValue(
	repository: Repository,
	columnId: string,
	runs: readonly CommandRun[],
): string {
	if (columnId === 'lastCommitDate') {
		return formatDate(repository.lastCommitDate)
	}

	if (columnId === 'changedFiles') {
		return repository.changedFiles === 0 ? 'Clean' : `${repository.changedFiles} Changed`
	}

	return columnId === 'branch'
		? `⑂ ${repository.branch}`
		: formatColumnCellValue(repository, columnId, runs).slice(0, 8000)
}
