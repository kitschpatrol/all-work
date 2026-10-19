import type { OpenTarget } from './electron-api.js'
import type { Repository } from './workspace.js'
import { vscodeUrl } from './table-formatting.js'
/** Targets the server opens with native macOS applications. */
export type NativeOpenTarget = 'finder' | 'readme' | 'terminal' | 'tower'

const githubScpRemote = /^(?:[^\/@:\s]+@)?github\.com:(.+)$/iv
const trailingSlashes = /\/+$/v
const gitSuffix = /\.git$/iv

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

/**
 * Open a repository in GitHub or VS Code through the browser, the same way the
 * repository cell's links do. Electron hands these to the default browser or
 * app.
 */
export function openRepositoryLink(
	repository: { path: string; remote: string },
	target: 'github' | 'vscode',
): void {
	if (target === 'github') {
		const url = getGithubUrl(repository.remote)
		if (url !== undefined) {
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
 * action.
 */
export async function openRepositories(
	repositories: readonly Repository[],
	target: OpenTarget,
	openInApp: (repository: Repository, app: NativeOpenTarget) => Promise<void>,
): Promise<void> {
	for (const repository of repositories) {
		if (target === 'github' || target === 'vscode') {
			openRepositoryLink(repository, target)
		} else {
			await openInApp(repository, target)
		}
	}
}
