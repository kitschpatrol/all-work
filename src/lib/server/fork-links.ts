import type { MetadataContext } from 'metascope'
import { getGithubPageUrl, getGithubUrl } from '#lib/repository-links.js'
import { helpers } from 'metascope'
import { optionalGit } from './git-command.js'

const remoteEntry = /^remote\.(\S+)\.url\s+(\S+)$/v

async function parentBranch(directory: string, parent: string): Promise<string | undefined> {
	const config = await optionalGit(directory, ['config', '--get-regexp', '^remote\\..*\\.url$'])
	let branch: string | undefined
	for (const entry of config.split('\n')) {
		const match = remoteEntry.exec(entry)
		const remote = match?.[1]
		if (
			remote === undefined ||
			getGithubUrl(match?.[2] ?? '')?.toLowerCase() !== parent.toLowerCase()
		) {
			continue
		}

		const prefix = `refs/remotes/${remote}/`
		const ref = await optionalGit(directory, ['symbolic-ref', `${prefix}HEAD`])
		if (ref.startsWith(prefix)) {
			branch = ref.slice(prefix.length)
			break
		}
	}

	return branch
}

function qualifiedRef(repository: string, branch: string) {
	return `${new URL(repository).pathname.slice(1).replace('/', ':')}:${encodeURIComponent(branch)}`
}

/** Compare fork defaults only when the parent's default branch is known locally. */
export async function getForkComparisonLinks(
	directory: string,
	remote: string,
	context: MetadataContext,
): Promise<Record<string, string[] | undefined>> {
	const github = helpers.firstOf(context.github)?.data
	const fork = getGithubUrl(remote)
	const parent = getGithubUrl(github?.forkedFrom ?? '')
	const branch = github?.defaultBranch
	const links: Record<string, string[] | undefined> = {
		'Fork Ahead': undefined,
		'Fork Behind': undefined,
	}
	if (fork === undefined || parent === undefined || branch === undefined) {
		return links
	}

	const baseBranch = await parentBranch(directory, parent)
	if (baseBranch === undefined) {
		return links
	}

	const base = qualifiedRef(parent, baseBranch)
	const head = qualifiedRef(fork, branch)
	const ahead = getGithubPageUrl(fork, `compare/${base}...${head}`)
	const behind = getGithubPageUrl(fork, `compare/${head}...${base}`)
	return {
		'Fork Ahead': ahead === undefined ? undefined : [ahead],
		'Fork Behind': behind === undefined ? undefined : [behind],
	}
}
