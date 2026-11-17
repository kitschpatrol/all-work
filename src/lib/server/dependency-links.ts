import type { MetadataContext } from 'metascope'
import { parseExternalUrl } from '#lib/external-links.js'
import { getRepositoryUrl } from '#lib/repository-links.js'
import { helpers } from 'metascope'

type Candidates = Map<string, Set<string>>
const localSpecifier = /^(?:workspace|file|link|portal|patch):/v
const npmAlias = /^(?<name>@[^\/]+\/[^@]+|[^@]+)(?:@.*)?$/v
const githubPrefix = /^github:/v
const githubShorthand = /^[\w.\-]+\/[\w.\-]+(?:#.*)?$/v
const sourceSpecifier = /[:\/\\]/v
const pythonName = /^[\w.\-]+/v
const pythonSource = /\s@\s*(\S+)/v

function add(candidates: Candidates, name: string, url = '') {
	const urls = candidates.get(name) ?? new Set<string>()
	urls.add(url)
	candidates.set(name, urls)
}

function webUrl(value: string) {
	const url = parseExternalUrl(value)
	return url !== undefined && ['http:', 'https:'].includes(url.protocol) ? url.href : undefined
}

function nodeDependency(name: string, specifier: string) {
	if (localSpecifier.test(specifier)) {
		return
	}

	if (specifier.startsWith('npm:')) {
		const alias = npmAlias.exec(specifier.slice(4))?.groups?.name
		return alias === undefined ? undefined : `https://www.npmjs.com/package/${alias}`
	}

	const remote = specifier.replace(githubPrefix, 'https://github.com/').split('#', 1)[0] ?? ''
	const repository = getRepositoryUrl(remote)
	if (repository !== undefined) {
		return repository
	}

	if (githubShorthand.test(specifier)) {
		return `https://github.com/${remote}`
	}

	return sourceSpecifier.test(specifier) ? undefined : `https://www.npmjs.com/package/${name}`
}

function addNode(candidates: Candidates, context: MetadataContext, development: boolean) {
	for (const { data } of helpers.ensureArray(context.nodePackageJson)) {
		const dependencies = development ? data.devDependencies : data.dependencies
		const entries = Object.entries(dependencies ?? {})
		for (const [name, specifier] of entries) {
			add(candidates, name, nodeDependency(name, specifier))
		}
	}
}

function addPython(candidates: Candidates, context: MetadataContext) {
	const dependencies = [
		...helpers
			.ensureArray(context.pythonPyprojectToml)
			.flatMap(({ data }) => data.project?.dependencies ?? []),
		...helpers.ensureArray(context.pythonSetupPy).flatMap(({ data }) => data.install_requires),
		...helpers.ensureArray(context.pythonSetupCfg).flatMap(({ data }) => data.install_requires),
		...helpers.ensureArray(context.pythonPkgInfo).flatMap(({ data }) => data.requires_dist),
	]
	for (const specifier of dependencies) {
		const name = pythonName.exec(specifier.trim())?.[0]
		if (name === undefined) {
			continue
		}

		const source = pythonSource.exec(specifier)?.[1]
		const url =
			source === undefined
				? `https://pypi.org/project/${encodeURIComponent(name)}/`
				: (getRepositoryUrl(source.split('#', 1)[0] ?? '') ?? webUrl(source))
		add(candidates, name, url)
	}
}

function addOtherRegistries(
	candidates: Candidates,
	context: MetadataContext,
	development: boolean,
) {
	for (const { data } of helpers.ensureArray(context.rustCargoToml)) {
		const dependencies = development ? data.devDependencies : data.dependencies
		for (const dependency of dependencies) {
			add(
				candidates,
				dependency.name,
				dependency.version === undefined
					? undefined
					: `https://crates.io/crates/${encodeURIComponent(dependency.name)}`,
			)
		}
	}

	for (const { data } of helpers.ensureArray(context.rubyGemspec)) {
		for (const dependency of data.dependencies) {
			if (dependency.type !== (development ? 'development' : 'runtime')) {
				continue
			}

			add(
				candidates,
				dependency.name,
				`https://rubygems.org/gems/${encodeURIComponent(dependency.name)}`,
			)
		}
	}

	for (const { data } of helpers.ensureArray(context.javaPomXml)) {
		const dependencies = development ? data.devDependencies : data.dependencies
		for (const dependency of dependencies) {
			add(
				candidates,
				dependency.artifactId,
				`https://central.sonatype.com/artifact/${encodeURIComponent(dependency.groupId)}/${encodeURIComponent(dependency.artifactId)}`,
			)
		}
	}

	if (!development) {
		for (const { data } of helpers.ensureArray(context.goGoMod)) {
			for (const dependency of data.dependencies) {
				add(
					candidates,
					dependency.module,
					`https://pkg.go.dev/${dependency.module
						.split('/')
						.map((part) => encodeURIComponent(part))
						.join('/')}`,
				)
			}
		}
	}
}

/**
 * Resolve package links from their manifest ecosystem, leaving ambiguous names
 * unlinked.
 */
export function getDependencyLinks(context: MetadataContext, development: boolean) {
	const candidates: Candidates = new Map()
	addNode(candidates, context, development)
	if (!development) {
		addPython(candidates, context)
	}

	addOtherRegistries(candidates, context, development)
	return new Map(
		Array.from(candidates, ([name, urls]) => [name, urls.size === 1 ? [...urls][0] : undefined]),
	)
}
