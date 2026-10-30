import { getWebsiteUrl } from '#lib/repository-links.js'
import { defineTemplate, helpers, templates } from 'metascope'
import { getRemoteRepository } from './repository-remote.js'

type UpstreamStats = { upstreamAhead?: number; upstreamBehind?: number; upstreamBranch?: string }

/**
 * Compare with the upstream the current branch tracks. Metascope omits the
 * counts when the upstream ref is missing locally.
 */
function getUpstream(gitStats: undefined | UpstreamStats) {
	return {
		ahead: gitStats?.upstreamAhead ?? 0,
		behind: gitStats?.upstreamBehind ?? 0,
		upstream: gitStats?.upstreamBranch ?? '',
		upstreamGone: gitStats?.upstreamBranch !== undefined && gitStats.upstreamAhead === undefined,
	}
}

/** Derive All Work's project and repository fields from local Metascope sources. */
export const repositoryTemplate = defineTemplate((context, templateData) => {
	const project = templates.project(context, templateData)
	const frontmatter = templates.frontmatter(context, templateData)
	const gitStats = helpers.firstOf(context.gitStats)?.data
	const github = helpers.firstOf(context.github)?.data
	const remote =
		helpers.firstOf(context.gitConfig)?.data.remote?.origin?.url ??
		(typeof templateData.originRemote === 'string' ? templateData.originRemote : undefined)
	const identity = getRemoteRepository(remote ?? '')
	return {
		...project,
		...getUpstream(gitStats),
		available: {
			ci: helpers.firstOf(context.githubActions) !== undefined,
			code: helpers.firstOf(context.codeStats) !== undefined,
			files: helpers.firstOf(context.fileStats) !== undefined,
			git: gitStats !== undefined,
			github: helpers.firstOf(context.github) !== undefined,
			registry:
				helpers.firstOf(context.nodeNpmRegistry) !== undefined ||
				helpers.firstOf(context.pythonPypiRegistry) !== undefined ||
				helpers.firstOf(context.obsidianPluginRegistry) !== undefined,
			updates: helpers.firstOf(context.dependencyUpdates) !== undefined,
		},
		branch: gitStats?.branchCurrent,
		changedFiles: gitStats?.uncommittedFileCount,
		frontmatter,
		gitStatusAvailable: gitStats?.uncommittedFileCount !== undefined,
		packageManager: helpers.firstOf(context.nodePackageJson)?.data.packageManager,
		remote,
		repoName: identity?.name,
		repoOwner: identity?.owner,
		website: getWebsiteUrl(github?.homepageUrl, github?.url) ?? '',
	}
})
