/* eslint-disable ts/naming-convention -- Frontmatter keys preserve the Metascope template spelling. */
import type { MetadataContext, TemplateData } from 'metascope'
import { parseExternalUrl } from '#lib/external-links.js'
import { getGithubPageUrl } from '#lib/repository-links.js'
import { helpers, templates } from 'metascope'
import { getMetadataListLinks } from './metadata-list-links.js'

const trailingSlash = /\/$/v
const versionPrefix = /^v/v

function packageVersion(url: string | undefined, version: string | undefined) {
	const parsed = parseExternalUrl(url)
	if (parsed === undefined || version === undefined || version === '') {
		return
	}

	if (['npmjs.com', 'www.npmjs.com'].includes(parsed.hostname)) {
		parsed.pathname = `${parsed.pathname.replace(trailingSlash, '')}/v/${encodeURIComponent(version)}`
	} else if (parsed.hostname === 'pypi.org') {
		parsed.pathname = `${parsed.pathname.replace(trailingSlash, '')}/${encodeURIComponent(version)}/`
	} else {
		return
	}

	return parsed.href
}

function firstSource(entries: Array<[number | string | undefined, string | undefined]>) {
	return entries.find(([value]) => value !== undefined)?.[1]
}

function getReleaseLinks(
	context: MetadataContext,
	remote: string,
	localVersion: string | undefined,
) {
	const github = { ...helpers.firstOf(context.github)?.data }
	const npm = { ...helpers.firstOf(context.nodeNpmRegistry)?.data }
	const python = { ...helpers.firstOf(context.pythonPypiRegistry)?.data }
	const obsidian = { ...helpers.firstOf(context.obsidianPluginRegistry)?.data }
	const manifest = { ...helpers.firstOf(context.obsidianPluginManifestJson)?.data }
	const release =
		github.releaseVersionLatest === undefined
			? undefined
			: getGithubPageUrl(remote, `releases/tag/${encodeURIComponent(github.releaseVersionLatest)}`)
	const npmVersion = packageVersion(npm.url, npm.versionLatest)
	const pythonVersion = packageVersion(python.url, python.versionLatest)
	const knownVersion = (version: string | undefined) =>
		version === undefined
			? undefined
			: firstSource([
					[version === npm.versionLatest ? version : undefined, npmVersion],
					[version === python.versionLatest ? version : undefined, pythonVersion],
					[
						version === github.releaseVersionLatest?.replace(versionPrefix, '')
							? version
							: undefined,
						release,
					],
				])
	return {
		'Downloads Monthly': firstSource([
			[npm.downloadsMonthly, npm.url],
			[python.downloadsMonthly, python.url],
		]),
		'Downloads Total': firstSource([
			[npm.downloadsTotal, npm.url],
			[obsidian.downloadCount, obsidian.url],
			[python.downloads180Days, python.url],
			[github.releaseDownloadCount, release],
		]),
		'Latest Release Version': firstSource([
			[manifest.version, knownVersion(manifest.version)],
			[npm.versionLatest, npmVersion],
			[python.versionLatest, pythonVersion],
			[github.releaseVersionLatest, release],
		]),
		Releases: github.releaseCount === undefined ? undefined : getGithubPageUrl(remote, 'releases'),
		Version: knownVersion(localVersion),
	}
}

/** Pair destinations with the source used for each displayed value. */
export function getMetadataLinks(
	context: MetadataContext,
	templateData: TemplateData,
	frontmatter: ReturnType<typeof templates.frontmatter>,
	remote: string,
): Record<string, string[] | undefined> {
	const codemeta = templates.codemetaJson(context, templateData)
	const github = helpers.firstOf(context.github)?.data
	const links = {
		...getReleaseLinks(context, remote, codemeta.version),
		Contributors:
			github?.contributorCount === undefined
				? undefined
				: getGithubPageUrl(remote, 'graphs/contributors'),
	}
	return {
		...Object.fromEntries(
			Object.entries(links).map(([field, url]) => [field, url === undefined ? undefined : [url]]),
		),
		...getMetadataListLinks(context, codemeta, frontmatter),
	}
}
