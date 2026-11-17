import type { Repository } from '#lib/workspace.js'
import { getGithubPageUrl, getRepositoryUrl } from '#lib/repository-links.js'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

type ReadGit = (args: string[]) => Promise<string>
const fields = [
	'Latest Commit Date',
	'First Commit Date',
	'Git Current Branch',
	'Git Commits',
	'Git Submodules',
	'ahead',
	'behind',
]

function setLink(repository: Repository, field: string, url: string | undefined) {
	if (url === undefined || repository.metadata === undefined) {
		return
	}

	repository.metadata.links ??= {}
	repository.metadata.links[field] = [url]
}

function hostedPath(repositoryUrl: string, kind: 'commit' | 'history', ref: string) {
	const host = new URL(repositoryUrl).hostname
	const routes =
		host === 'gitlab.com'
			? { commit: '-/commit', history: '-/commits' }
			: { commit: host === 'bitbucket.org' ? 'commits' : 'commit', history: 'commits' }
	return `${repositoryUrl}/${routes[kind]}/${encodeURIComponent(ref)}`
}

async function contains(readGit: ReadGit, commit: string) {
	return (
		commit !== '' &&
		(await readGit([
			'for-each-ref',
			`--contains=${commit}`,
			'--format=%(refname)',
			'refs/remotes/origin/',
		])) !== ''
	)
}

async function submoduleLink(repository: Repository) {
	const count = repository.metadata?.values['Git Submodules']
	if (typeof count !== 'number' || count === 0) {
		return
	}

	const file = path.join(repository.path, '.gitmodules')
	try {
		await access(file)
		setLink(repository, 'Git Submodules', pathToFileURL(file).href)
	} catch {
		// A removed or inaccessible manifest has no useful destination.
	}
}

async function historyLinks(
	repository: Repository,
	repositoryUrl: string,
	head: string,
	readGit: ReadGit,
) {
	const refs = await readGit([
		'for-each-ref',
		'--format=%(refname:strip=3)%00%(objectname)',
		'refs/remotes/origin/',
	])
	if (refs === '') {
		return
	}

	const branches = new Map(
		refs.split('\n').map((line) => {
			const [name = '', commit = ''] = line.split('\0', 2)
			return [name, commit]
		}),
	)
	const published = branches.values().toArray().includes(head) || (await contains(readGit, head))
	if (published) {
		setLink(repository, 'Latest Commit Date', hostedPath(repositoryUrl, 'commit', head))
		setLink(repository, 'Git Commits', hostedPath(repositoryUrl, 'history', head))
		const upstream = repository.upstream.startsWith('origin/')
			? branches.get(repository.upstream.slice('origin/'.length))
			: undefined
		if (upstream !== undefined && !repository.upstreamGone) {
			setLink(repository, 'ahead', getGithubPageUrl(repositoryUrl, `compare/${upstream}...${head}`))
			setLink(
				repository,
				'behind',
				getGithubPageUrl(repositoryUrl, `compare/${head}...${upstream}`),
			)
		}
	}

	const roots = await readGit(['log', '--max-parents=0', '--format=%H', 'HEAD', '--'])
	const first = roots.split('\n').at(-1) ?? ''
	if (first !== '' && (published || (await contains(readGit, first)))) {
		setLink(repository, 'First Commit Date', hostedPath(repositoryUrl, 'commit', first))
	}
}

/**
 * Link Git values only to refs known locally to be present on the origin
 * remote.
 */
export async function updateGitColumnLinks(repository: Repository, head: string, readGit: ReadGit) {
	if (repository.metadata?.links !== undefined) {
		for (const field of fields) {
			Reflect.deleteProperty(repository.metadata.links, field)
		}
	}

	await submoduleLink(repository)
	const repositoryUrl = getRepositoryUrl(repository.remote)
	if (repositoryUrl !== undefined && head !== '') {
		await historyLinks(repository, repositoryUrl, head, readGit)
	}
}
