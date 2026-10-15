import type { CommandRun, Repository } from './workspace.js'
import { getColumnValue } from './column-variables.js'

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
		return repository.changedFiles === 0 ? 'Clean' : `${repository.changedFiles} changed`
	}

	return columnId === 'branch'
		? `⑂ ${repository.branch}`
		: String(getColumnValue(repository, columnId, runs) ?? '').slice(0, 8000)
}
