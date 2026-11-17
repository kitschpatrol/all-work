import type { OpenTarget } from './electron-api.js'
import type { Repository } from './workspace.js'
import { vscodeUrl } from './table-formatting.js'
/** Targets the server opens with native macOS applications. */
export type NativeOpenTarget = Exclude<OpenTarget, 'github' | 'vscode' | 'vscode-workspace'>

const scpRemote = /^(?:[^\/@:\s]+@)?(github\.com|gitlab\.com|bitbucket\.org):(.+)$/iv
const trailingSlashes = /\/+$/v
const gitSuffix = /\.git$/iv
const urlScheme = /^[a-z][a-z\d+.\-]*:/iv
const gitProtocolPrefix = /^git\+/iv

/** Convert supported clone remotes into credential-free repository browser URLs. */
export function getRepositoryUrl(remote: string): string | undefined {
	try {
		const url = new URL(remote.replace(gitProtocolPrefix, '').replace(scpRemote, 'https://$1/$2'))
		if (
			!['bitbucket.org', 'github.com', 'gitlab.com'].includes(url.hostname) ||
			!['git:', 'http:', 'https:', 'ssh:'].includes(url.protocol)
		) {
			return undefined
		}

		const segments = url.pathname.replace(trailingSlashes, '').slice(1).split('/')
		const repository = (segments.at(-1) ?? '').replace(gitSuffix, '')
		return repository === '' ||
			segments.length < 2 ||
			(url.hostname !== 'gitlab.com' && segments.length !== 2) ||
			segments.includes('')
			? undefined
			: `https://${url.hostname}/${[...segments.slice(0, -1), repository].join('/')}`
	} catch {
		return undefined
	}
}

/** Convert a GitHub clone remote into a credential-free repository browser URL. */
export function getGithubUrl(remote: string): string | undefined {
	const url = getRepositoryUrl(remote)
	return url?.startsWith('https://github.com/') === true ? url : undefined
}

/** Build a GitHub repository page with encoded search parameters. */
export function getGithubPageUrl(
	remote: string,
	page: string,
	parameters: Record<string, string> = {},
): string | undefined {
	const repositoryUrl = getGithubUrl(remote)
	if (repositoryUrl === undefined) {
		return
	}

	const url = new URL(`${repositoryUrl}/${page}`)
	for (const [key, value] of Object.entries(parameters)) {
		url.searchParams.set(key, value)
	}

	return url.href
}

/** Link to successful or failed Actions history across branches and commits. */
export function getGithubActionsUrl(remote: string, conclusion: 'failure' | 'success') {
	return getGithubPageUrl(remote, 'actions', { query: `is:${conclusion}` })
}

/** Return a website link unless it points back to the repository's GitHub page. */
export function getWebsiteUrl(website = '', repositoryUrl = ''): string | undefined {
	const text = website.trim()
	if (text === '') {
		return undefined
	}

	try {
		const url = new URL(urlScheme.test(text) ? text : `https://${text}`)
		if (!['http:', 'https:'].includes(url.protocol)) {
			return undefined
		}

		const githubUrl = getGithubUrl(repositoryUrl)
		return githubUrl !== undefined &&
			getGithubUrl(url.href)?.toLowerCase() === githubUrl.toLowerCase()
			? undefined
			: url.href
	} catch {
		return undefined
	}
}

/**
 * Open a repository in GitHub, VS Code, or its website, the same way the
 * repository cell's links do. Electron hands these to the default browser or
 * app.
 */
export function openRepositoryLink(
	repository: Pick<Repository, 'path' | 'remote' | 'website'>,
	target: 'github' | 'vscode' | 'website',
): void {
	if (target === 'github' || target === 'website') {
		const url = target === 'github' ? getGithubUrl(repository.remote) : repository.website
		if (url !== undefined && url !== '') {
			window.open(url, '_blank', 'noopener,noreferrer')
		}

		return
	}

	const anchor = document.createElement('a')
	anchor.href = vscodeUrl(repository.path)
	anchor.rel = 'external'
	anchor.click()
}

/**
 * Open the chosen repositories in order using the matching browser or native
 * action, skipping those without a GitHub remote or readme to open.
 */
export async function openRepositories(
	repositories: readonly Repository[],
	target: OpenTarget,
	openInApp: (repository: Repository, app: NativeOpenTarget) => Promise<void>,
	openInVsCode: (repositories: readonly Repository[], asWorkspace: boolean) => Promise<void>,
): Promise<void> {
	if (repositories.length === 0) {
		return
	}

	if (target === 'vscode' || target === 'vscode-workspace') {
		await openInVsCode(repositories, target === 'vscode-workspace')
		return
	}

	for (const repository of repositories) {
		if (target === 'github') {
			openRepositoryLink(repository, target)
		} else if (target !== 'readme' || repository.readme !== '') {
			await openInApp(repository, target)
		}
	}
}
