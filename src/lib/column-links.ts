/* eslint-disable ts/naming-convention -- Column labels preserve the Metascope template spelling. */
import type { Repository } from './workspace.js'
import { getGithubActionsUrl, getGithubPageUrl, getRepositoryUrl } from './repository-links.js'

const githubPages: Record<string, string> = {
	Forks: 'forks',
	'Latest Push Date': 'activity',
	Stars: 'stargazers',
	Watchers: 'watchers',
}
const githubQueries: Record<string, [string, string]> = {
	'Issues Closed': ['issues', 'is:issue is:closed'],
	'Issues Open': ['issues', 'is:issue is:open'],
	'PRs Closed': ['pulls', 'is:pr is:closed is:unmerged'],
	'PRs Merged': ['pulls', 'is:pr is:merged'],
	'PRs Open': ['pulls', 'is:pr is:open'],
	'Vulnerability Alerts': ['security/dependabot', 'is:open'],
}

function stringValue(repository: Repository, field: string) {
	const value = repository.metadata?.values[field]
	return typeof value === 'string' && value !== '' ? value : undefined
}

function githubDestination(repository: Repository, field: string) {
	const page = githubPages[field]
	if (page !== undefined) {
		return getGithubPageUrl(repository.remote, page)
	}

	const query = githubQueries[field]
	return query === undefined
		? undefined
		: getGithubPageUrl(repository.remote, query[0], { q: query[1] })
}

/** Derive destinations whose meaning is independent of the metadata source. */
export function getColumnDestination(repository: Repository, id: string, field?: string) {
	const repositoryUrl = getRepositoryUrl(repository.remote)
	if (id === 'repoOwner') {
		return repositoryUrl?.slice(0, repositoryUrl.lastIndexOf('/'))
	}

	if (field === undefined) {
		return
	}

	switch (field) {
		case 'Account': {
			const account = stringValue(repository, field)
			return account === undefined ? undefined : `https://github.com/${encodeURIComponent(account)}`
		}

		case 'Actions Failed Count': {
			return getGithubActionsUrl(repository.remote, 'failure')
		}

		case 'Actions Passed Count': {
			return getGithubActionsUrl(repository.remote, 'success')
		}

		case 'CI': {
			return stringValue(repository, 'CI URL')
		}

		case 'Folder Name': {
			const url = new URL('file:///')
			url.pathname = repository.path
			return url.href
		}

		case 'Published': {
			return repository.metadata?.values.Published === true
				? stringValue(repository, 'Package URL')
				: undefined
		}

		default: {
			return githubDestination(repository, field)
		}
	}
}
