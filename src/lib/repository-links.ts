import { vscodeUrl } from './table-formatting.js'
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
