import type { OpenTarget } from './electron-api.js'
import type { Repository } from './workspace.js'
import { vscodeUrl } from './table-formatting.js'
/** Targets the server opens with native macOS applications. */
export type NativeOpenTarget = Exclude<OpenTarget, 'github' | 'vscode'>

const githubScpRemote = /^(?:[^\/@:\s]+@)?github\.com:(.+)$/iv
const trailingSlashes = /\/+$/v
const gitSuffix = /\.git$/iv
const urlScheme = /^[a-z][a-z\d+.\-]*:/iv

/** Convert a GitHub clone remote into a credential-free repository browser URL. */
export function getGithubUrl(remote: string): string | undefined {
	try {
		const url = new URL(remote.replace(githubScpRemote, 'https://github.com/$1'))
		if (
			url.hostname !== 'github.com' ||
			!['git:', 'http:', 'https:', 'ssh:'].includes(url.protocol)
		) {
			return undefined
		}

		const segments = url.pathname.replace(trailingSlashes, '').slice(1).split('/')
		const owner = segments[0] ?? ''
		const repository = (segments[1] ?? '').replace(gitSuffix, '')
		return owner === '' || repository === '' || segments.length !== 2
			? undefined
			: `https://github.com/${owner}/${repository}`
	} catch {
		return undefined
	}
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
): Promise<void> {
	for (const repository of repositories) {
		if (target === 'github' || target === 'vscode') {
			openRepositoryLink(repository, target)
		} else if (target !== 'readme' || repository.readme !== '') {
			await openInApp(repository, target)
		}
	}
}
