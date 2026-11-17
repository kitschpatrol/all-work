/* eslint-disable ts/naming-convention -- Frontmatter keys preserve the Metascope template spelling. */
import type { MetadataContext, templates } from 'metascope'
import { parseExternalUrl } from '#lib/external-links.js'
import { getRepositoryUrl } from '#lib/repository-links.js'
import { helpers } from 'metascope'
import { getDependencyLinks } from './dependency-links.js'

type Codemeta = ReturnType<typeof templates.codemetaJson>
type Frontmatter = ReturnType<typeof templates.frontmatter>

function webUrl(value: string | undefined) {
	const url = parseExternalUrl(value)
	return url !== undefined && ['http:', 'https:'].includes(url.protocol) ? url.href : undefined
}

function personLinks(labels: string[] | undefined, people: Codemeta['author']) {
	return labels?.map((label) => {
		const matching =
			people?.filter((person) => helpers.toBasicNames([person])?.includes(label) === true) ?? []
		const urls = new Set(
			matching
				.map((person) => webUrl(person.url) ?? webUrl(person.id))
				.filter((url) => url !== undefined),
		)
		return urls.size === 1 ? ([...urls][0] ?? '') : ''
	})
}

function dependencyLinks(
	context: MetadataContext,
	labels: string[] | undefined,
	dependencies: Codemeta['softwareRequirements'],
	development: boolean,
) {
	const sources = getDependencyLinks(context, development)
	return labels?.map((label) => {
		if (sources.has(label)) {
			return sources.get(label) ?? ''
		}

		const matching =
			dependencies?.filter((dependency) => (dependency.name ?? dependency.identifier) === label) ??
			[]
		const urls = new Set(
			matching
				.map(
					(dependency) =>
						webUrl(dependency.url) ??
						getRepositoryUrl(dependency.codeRepository ?? '') ??
						webUrl(dependency.codeRepository),
				)
				.filter((url) => url !== undefined),
		)
		return urls.size === 1 ? ([...urls][0] ?? '') : ''
	})
}

/** Retain per-item destinations that the compact frontmatter otherwise discards. */
export function getMetadataListLinks(
	context: MetadataContext,
	codemeta: Codemeta,
	frontmatter: Frontmatter,
) {
	const topics = new Set(helpers.firstOf(context.github)?.data.topics)
	const licenses = helpers.ensureArray(codemeta.license)
	return {
		Author: personLinks(frontmatter.Author ?? undefined, codemeta.author),
		Contributor: personLinks(frontmatter.Contributor ?? undefined, codemeta.contributor),
		Dependencies: dependencyLinks(
			context,
			frontmatter.Dependencies ?? undefined,
			codemeta.softwareRequirements,
			false,
		),
		'Dev Dependencies': dependencyLinks(
			context,
			frontmatter['Dev Dependencies'] ?? undefined,
			codemeta.softwareSuggestions,
			true,
		),
		License: frontmatter.License?.map(
			(label) =>
				webUrl(
					licenses.find((license) => helpers.toBasicLicenses(license)?.includes(label) === true),
				) ?? '',
		),
		Maintainer: personLinks(frontmatter.Maintainer ?? undefined, codemeta.maintainer),
		Tags: frontmatter.Tags?.map((label) =>
			topics.has(label) ? `https://github.com/topics/${encodeURIComponent(label)}` : '',
		),
	}
}
