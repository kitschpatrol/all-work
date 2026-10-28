import type { CommandRun, Repository } from './workspace.js'
import { formatColumnCellValue, getColumnValue } from './column-variables.js'

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
 * The status that tints a repository's output cell: running, success, or
 * failed. Queued, cancelled, and missing results keep the row background.
 */
export function runCellStatus(run: CommandRun, repositoryId: string) {
	const status = run.results[repositoryId]?.status
	return status === 'running' || status === 'success' || status === 'failed' ? status : undefined
}

/** Count the repositories whose command succeeded and failed. */
export function runOutcomes(run: CommandRun) {
	const results = Object.values(run.results)
	return {
		failed: results.filter((result) => result.status === 'failed').length,
		succeeded: results.filter((result) => result.status === 'success').length,
	}
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

/**
 * Whether a repository has metadata loading now, only queued, or neither.
 * Loading wins, since only a few repositories load at once.
 */
export function metadataActivity(repository: Repository): 'loading' | 'queued' | undefined {
	const states = Object.values(repository.metadata?.groups ?? {})
	if (states.some((state) => state.status === 'loading')) {
		return 'loading'
	}

	return states.some((state) => state.status === 'queued') ? 'queued' : undefined
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

/** Format a cell as plain text for copying, leaving missing values empty. */
function getColumnCopyText(
	repository: Repository,
	columnId: string,
	runs: readonly CommandRun[],
): string {
	const value = getColumnValue(repository, columnId, runs)
	if (value === undefined || value === '') {
		return ''
	}

	switch (columnId) {
		case 'changedFiles': {
			return repository.changedFiles === 0 ? 'Clean' : `${repository.changedFiles} Changed`
		}

		case 'lastCommitDate': {
			return formatDate(repository.lastCommitDate)
		}

		case 'sync': {
			return `↑${repository.ahead} ↓${repository.behind}`
		}

		default: {
			return formatColumnCellValue(repository, columnId, runs)
		}
	}
}

/** Join one column's plain text for each row, one row per line. */
export function getColumnCopyLines(
	repositories: readonly Repository[],
	columnId: string,
	runs: readonly CommandRun[],
): string {
	return repositories.map((repository) => getColumnCopyText(repository, columnId, runs)).join('\n')
}
