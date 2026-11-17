/* eslint-disable ts/naming-convention -- Frontmatter keys preserve the Metascope template spelling. */
import type { MetadataContext } from 'metascope'
import { sourceNames } from 'metascope'
import { describe, expect, it } from 'vitest'
import { repositoryTemplate } from './repository-template.js'

function project(data: Partial<MetadataContext>) {
	const context = Object.assign(
		Object.fromEntries(sourceNames.map((name) => [name, undefined])),
		data,
	) as MetadataContext
	return repositoryTemplate(context, { originRemote: 'git@github.com:team/project.git' })
}

function linked(
	result: ReturnType<typeof repositoryTemplate>,
	field: 'Author' | 'Dependencies' | 'Dev Dependencies' | 'License' | 'Tags',
) {
	return Object.fromEntries(
		(result.frontmatter[field] ?? []).map((label, index) => [label, result.links[field]?.[index]]),
	)
}

describe('metadata link provenance', () => {
	it('links sorted dependency names to packages, aliases, and Git sources without linking local packages', () => {
		const result = project({
			nodePackageJson: {
				data: {
					_id: 'project@1.0.0',
					dependencies: {
						alias: 'npm:@scope/actual@^2',
						fork: 'github:owner/library#next',
						local: 'workspace:*',
						source: 'git+https://github.com/owner/source.git#main',
						zod: '^4',
					},
					devDependencies: { vitest: '^5' },
					name: 'project',
					readme: '',
					version: '1.0.0',
				},
				source: 'package.json',
			},
		})
		expect(linked(result, 'Dependencies')).toEqual({
			alias: 'https://www.npmjs.com/package/@scope/actual',
			fork: 'https://github.com/owner/library',
			local: '',
			source: 'https://github.com/owner/source',
			zod: 'https://www.npmjs.com/package/zod',
		})
		expect(linked(result, 'Dev Dependencies')).toEqual({
			vitest: 'https://www.npmjs.com/package/vitest',
		})
	})

	it('keeps names shared by different package ecosystems unlinked', () => {
		const result = project({
			nodePackageJson: {
				data: {
					_id: 'project@1.0.0',
					dependencies: { requests: '^1' },
					name: 'project',
					readme: '',
					version: '1.0.0',
				},
				source: 'package.json',
			},
			pythonPyprojectToml: {
				data: {
					project: {
						dependencies: ['requests>=2', 'httpx>=0.28'],
						license: undefined,
						name: 'project',
						rawName: 'project',
						readme: undefined,
					},
				},
				source: 'pyproject.toml',
			},
		})
		expect(linked(result, 'Dependencies')).toEqual({
			httpx: 'https://pypi.org/project/httpx/',
			requests: '',
		})
	})

	it('retains supplied person, dependency, and license URLs without guessing missing destinations', () => {
		const result = project({
			codemetaJson: {
				data: {
					author: [
						{ name: 'Example Author', url: 'https://example.com/author' },
						{ name: 'Unlinked Author' },
					],
					license: ['MIT', 'UNLICENSED'],
					softwareRequirements: [{ name: 'Custom Library', url: 'https://example.com/library' }],
				},
				source: 'codemeta.json',
			},
		})
		expect(linked(result, 'Author')).toEqual({
			'Example Author': 'https://example.com/author',
			'Unlinked Author': '',
		})
		expect(linked(result, 'Dependencies')).toEqual({
			'Custom Library': 'https://example.com/library',
		})
		expect(linked(result, 'License')).toEqual({ MIT: 'https://spdx.org/licenses/MIT' })
	})

	it('links only confirmed GitHub topics and keeps languages plain', () => {
		const result = project({
			codemetaJson: {
				data: { keywords: ['topic', 'private tag'], programmingLanguage: ['C++'] },
				source: 'codemeta.json',
			},
			github: { data: { topics: ['topic'] }, source: 'github' },
		})
		expect(linked(result, 'Tags')).toMatchObject({
			'private tag': '',
			topic: 'https://github.com/topics/topic',
		})
		expect(result.links.Language).toBeUndefined()
		expect(result.links['Secondary Language']).toBeUndefined()
	})

	it('links versions and download counts to their sources, including numeric zero downloads', () => {
		const result = project({
			github: {
				data: {
					releaseCount: 2,
					releaseDateLatest: '2026-04-01',
					releaseDownloadCount: 100,
					releaseVersionLatest: 'v2.0.0',
				},
				source: 'github',
			},
			nodeNpmRegistry: {
				data: {
					downloadsMonthly: 0,
					downloadsTotal: 0,
					publishDateLatest: '2026-05-01',
					url: 'https://www.npmjs.com/package/@team/project',
					versionLatest: '3.0.0',
				},
				source: 'npm',
			},
			nodePackageJson: {
				data: { _id: '@team/project@3.0.0', name: '@team/project', readme: '', version: '3.0.0' },
				source: 'package.json',
			},
		})
		expect(result.links).toMatchObject({
			'Downloads Monthly': ['https://www.npmjs.com/package/@team/project'],
			'Downloads Total': ['https://www.npmjs.com/package/@team/project'],
			'Latest Release Version': ['https://www.npmjs.com/package/@team/project/v/3.0.0'],
			Releases: ['https://github.com/team/project/releases'],
			Version: ['https://www.npmjs.com/package/@team/project/v/3.0.0'],
		})
		expect(result.links.ID).toBeUndefined()
		expect(result.links['Latest Release Date']).toBeUndefined()
	})

	it('uses PyPI version pages and leaves unpublished local versions unlinked', () => {
		const result = project({
			codemetaJson: { data: { name: 'example', version: '2.0.0' }, source: 'codemeta.json' },
			pythonPypiRegistry: {
				data: {
					publishDateLatest: '2026-01-01',
					url: 'https://pypi.org/project/example/',
					versionLatest: '1.0.0',
				},
				source: 'pypi',
			},
		})
		expect(result.links['Latest Release Version']).toEqual([
			'https://pypi.org/project/example/1.0.0/',
		])
		expect(result.links['Latest Release Date']).toBeUndefined()
		expect(result.links.Version).toBeUndefined()
	})

	it('does not treat local tag or author counts as GitHub releases or contributors', () => {
		const result = project({
			gitStats: {
				data: { contributorCount: 2, tagReleaseCount: 3, tagVersionLatest: '1.0.0' },
				source: 'git',
			},
		})
		expect(result.frontmatter.Releases).toBe(3)
		expect(result.links.Releases).toBeUndefined()
		expect(result.links.Contributors).toBeUndefined()
		expect(result.links['Latest Release Version']).toBeUndefined()
	})
})
