import { defineTemplate, helpers, templates } from 'metascope'
import { getRemoteRepository } from './repository-remote.js'

/** Derive AllWork's project and repository fields from local Metascope sources. */
export const repositoryTemplate = defineTemplate((context, templateData) => {
	const project = templates.project(context, templateData)
	const frontmatter = templates.frontmatter(context, templateData)
	const gitStats = helpers.firstOf(context.gitStats)?.data
	const remote =
		helpers.firstOf(context.gitConfig)?.data.remote?.origin?.url ??
		(typeof templateData.originRemote === 'string' ? templateData.originRemote : undefined)
	const identity = getRemoteRepository(remote ?? '')
	return {
		...project,
		ahead: gitStats?.totalAhead ?? 0,
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
		behind: gitStats?.totalBehind ?? 0,
		branch: gitStats?.branchCurrent,
		changedFiles: gitStats?.uncommittedFileCount,
		frontmatter,
		gitStatusAvailable: gitStats?.uncommittedFileCount !== undefined,
		packageManager: helpers.firstOf(context.nodePackageJson)?.data.packageManager,
		remote,
		repoName: identity?.name,
		repoOwner: identity?.owner,
	}
})
