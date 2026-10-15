import parseGitUrl from 'git-url-parse'

/**
 * Read a hosted repository's name and owner without retaining remote
 * credentials.
 */
export function getRemoteRepository(remote: string): undefined | { name: string; owner: string } {
	let parsed: ReturnType<typeof parseGitUrl>
	try {
		parsed = parseGitUrl(remote)
	} catch {
		return undefined
	}

	return !['git', 'http', 'https', 'ssh'].includes(parsed.protocol) ||
		parsed.resource === '' ||
		parsed.name === ''
		? undefined
		: { name: parsed.name, owner: parsed.owner }
}
