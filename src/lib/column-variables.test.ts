/* eslint-disable ts/naming-convention -- Frontmatter keys preserve the Metascope template spelling. */
import { describe, expect, it } from 'vitest'
import type { CommandRun, Repository } from './workspace.js'
import {
	expandCommandVariables,
	formatColumnCellValue,
	getCellTooltip,
	getColumnDisplay,
	getColumnEnvironment,
	getColumnLinkedItems,
	getColumnTooltip,
	getColumnUrl,
	getColumnVariableName,
	getColumnVariables,
	getPendingCommandColumns,
	getVariablePreviewTooltip,
} from './column-variables.js'

const repository: Repository = {
	ahead: 2,
	behind: 3,
	branch: 'feature/example',
	changedFiles: 4,
	description: 'Example project description',
	gitStatusAvailable: true,
	id: 'repository',
	lastCommit: 'Example commit',
	lastCommitDate: '2026-10-15T12:00:00.000Z',
	name: '@example/project',
	packageManager: 'pnpm@12.11.2',
	path: '/workspace/project with spaces',
	readme: '',
	relativePath: 'project with spaces',
	remote: 'git@github.com:example/project.git',
	repoName: 'project',
	repoOwner: 'example',
	upstream: 'origin/main',
	upstreamGone: false,
	version: '1.2.3',
	website: '',
}

function outputRun(id: string, output: string, number = 1): CommandRun {
	return {
		command: 'git status --short',
		concurrency: 1,
		createdAt: '2026-10-15T12:00:00.000Z',
		finished: true,
		id,
		number,
		results: {
			[repository.id]: { output, repositoryId: repository.id, status: 'success', truncated: false },
		},
	}
}

describe('column variables', () => {
	it('links known counts to their exact GitHub filters and leaves missing counts unlinked', () => {
		const expanded: Repository = {
			...repository,
			metadata: {
				groups: {},
				values: { 'Issues Open': 0, 'PRs Closed': 2, 'PRs Merged': 3, 'Vulnerability Alerts': 1 },
			},
		}
		expect(getColumnUrl(expanded, 'metadata:Issues Open')?.searchParams.get('q')).toBe(
			'is:issue is:open',
		)
		expect(getColumnUrl(expanded, 'metadata:PRs Closed')?.searchParams.get('q')).toBe(
			'is:pr is:closed is:unmerged',
		)
		expect(getColumnUrl(expanded, 'metadata:PRs Merged')?.searchParams.get('q')).toBe(
			'is:pr is:merged',
		)
		expect(getColumnUrl(expanded, 'metadata:Vulnerability Alerts')?.pathname).toBe(
			'/example/project/security/dependabot',
		)
		expect(getColumnUrl(repository, 'metadata:Issues Open')).toBeUndefined()
	})

	it('resolves retained external links and keeps text columns plain despite cached links or URL values', () => {
		const run = 'https://github.com/example/project/actions/runs/1'
		const expanded: Repository = {
			...repository,
			metadata: {
				groups: {},
				links: {
					'Git Current Branch': ['https://github.com/example/project/tree/feature%2Fexample'],
					ID: ['https://www.npmjs.com/package/example'],
					Language: ['https://github.com/search?q=language:TypeScript'],
					'Latest Release Date': ['https://github.com/example/project/releases/tag/v1.2.3'],
					Name: ['https://example.com/'],
					remote: ['https://github.com/example/project'],
					repoName: ['https://github.com/example/project'],
					'Secondary Language': ['https://github.com/search?q=language:JavaScript'],
					Version: ['https://www.npmjs.com/package/example/v/1.2.3'],
				},
				values: {
					CI: 'Failure',
					'CI URL': run,
					'Homepage URL': 'https://example.com/',
					ID: 'https://www.npmjs.com/package/example',
					Language: ['TypeScript'],
					'Latest Release Date': '2026-10-15T12:00:00.000Z',
					'Package URL': 'https://www.npmjs.com/package/example',
					Published: true,
					'Secondary Language': ['JavaScript'],
				},
			},
			remote: 'https://github.com/example/project.git',
		}
		for (const columnId of [
			'branch',
			'name',
			'remote',
			'repoName',
			'metadata:ID',
			'metadata:Language',
			'metadata:Secondary Language',
			'metadata:Latest Release Date',
		]) {
			expect(getColumnUrl(expanded, columnId)).toBeUndefined()
			expect(getColumnLinkedItems(expanded, columnId)).toBeUndefined()
		}

		expect(getColumnUrl(expanded, 'repoOwner')?.href).toBe('https://github.com/example')
		expect(getColumnUrl(expanded, 'metadata:CI')?.href).toBe(run)
		expect(getColumnUrl(expanded, 'metadata:CI URL')?.href).toBe(run)
		expect(getColumnUrl(expanded, 'metadata:Published')?.href).toBe(
			'https://www.npmjs.com/package/example',
		)
		expect(getColumnUrl(expanded, 'version')?.href).toBe(
			'https://www.npmjs.com/package/example/v/1.2.3',
		)
		expect(getColumnEnvironment(expanded).ALL_WORK_COLUMN_VERSION).toBe('1.2.3')
		expect(
			getColumnUrl(
				{
					...expanded,
					metadata: { groups: {}, values: { ...expanded.metadata?.values, Published: false } },
				},
				'metadata:Published',
			),
		).toBeUndefined()
	})

	it('keeps ordinary tags and local metrics plain while allowing external URLs on individual list entries', () => {
		const expanded: Repository = {
			...repository,
			metadata: {
				groups: {},
				values: {
					'Git Tags': 4,
					License: ['https://example.com/license', 'Custom license'],
					Tags: ['personal'],
					'Total Updates': 3,
				},
			},
		}
		expect(getColumnLinkedItems(expanded, 'metadata:Tags')).toBeUndefined()
		expect(getColumnUrl(expanded, 'metadata:Git Tags')).toBeUndefined()
		expect(getColumnUrl(expanded, 'metadata:Total Updates')).toBeUndefined()
		expect(getColumnLinkedItems(expanded, 'metadata:License')).toEqual([
			{ label: 'https://example.com/license', url: new URL('https://example.com/license') },
			{ label: 'Custom license', url: undefined },
		])
	})

	it('sets counts as numbers, versions and locations as code, and prose, names, and booleans as text', () => {
		const expected = {
			ahead: 'number',
			behind: 'number',
			description: 'text',
			'metadata:Actions Failed': 'text',
			'metadata:Actions Failed Count': 'number',
			'metadata:Actions Passed': 'text',
			'metadata:Actions Passed Count': 'number',
			'metadata:Author': 'text',
			'metadata:Created': 'code',
			'metadata:Fork': 'text',
			'metadata:Git Remotes Ahead': 'number',
			'metadata:Latest Release Version': 'code',
			'metadata:Libyears': 'number',
			'metadata:Public': 'text',
			'metadata:Repo URL': 'code',
			'metadata:Stars': 'number',
			'metadata:Tags': 'text',
			name: 'text',
			packageManager: 'code',
			remote: 'code',
			repoName: 'text',
			repoOwner: 'text',
			'run-1': 'text',
			sync: 'number',
			version: 'code',
		}
		expect(
			Object.fromEntries(Object.keys(expected).map((id) => [id, getColumnDisplay(id)])),
		).toEqual(expected)
	})

	it('title-cases Metascope status keywords in cells but keeps them raw for commands', () => {
		const status = (value: string) => ({
			...repository,
			metadata: { groups: {}, values: { Author: 'lowercase author', Status: value } },
		})
		expect(
			['author', 'maintainer', 'observer', 'unknown'].map((value) =>
				formatColumnCellValue(status(value), 'metadata:Status'),
			),
		).toEqual(['Author', 'Maintainer', 'Observer', 'Unknown'])
		expect(formatColumnCellValue(status('author'), 'metadata:Author')).toBe('lowercase author')
		expect(getColumnEnvironment(status('author')).ALL_WORK_COLUMN_STATUS).toBe('author')
	})

	it('formats expanded metadata and keeps unknown values distinct from zero and false', () => {
		const expanded = {
			...repository,
			metadata: {
				groups: {},
				values: {
					'Actions Failed': [],
					'Actions Failed Count': 0,
					'Actions Passed': ['CI', 'Release'],
					'Actions Passed Count': 2,
					Public: false,
					Stars: 0,
					Tags: ['one', 'two'],
				},
			},
		}
		const environment = getColumnEnvironment(expanded)
		expect(environment.ALL_WORK_COLUMN_ACTIONS_PASSED_COUNT).toBe('2')
		expect(environment.ALL_WORK_COLUMN_ACTIONS_FAILED_COUNT).toBe('0')
		expect(environment.ALL_WORK_COLUMN_ACTIONS_PASSED).toBe('CI, Release')
		expect(environment.ALL_WORK_COLUMN_ACTIONS_FAILED).toBe('')
		expect(formatColumnCellValue(expanded, 'metadata:Actions Failed Count')).toBe('0')
		expect(formatColumnCellValue(repository, 'metadata:Actions Failed Count')).toBe('—')
		expect(formatColumnCellValue(expanded, 'metadata:Actions Passed')).toBe('CI, Release')
		expect(formatColumnCellValue(expanded, 'metadata:Actions Failed')).toBe('—')
		expect(environment.ALL_WORK_COLUMN_PUBLIC).toBe('false')
		expect(environment.ALL_WORK_COLUMN_STARS).toBe('0')
		expect(environment.ALL_WORK_COLUMN_TAGS).toBe('one, two')
		expect(environment.ALL_WORK_COLUMN_TOTAL_UPDATES).toBe('')
		const variables = getColumnVariables()
		expect(new Set(variables.map((variable) => variable.name)).size).toBe(variables.length)
	})

	it('pairs workflow names with their own run URLs, including duplicate names and missing links', () => {
		const first = 'https://github.com/team/project/actions/runs/1'
		const second = 'https://github.com/team/project/actions/runs/2'
		const expanded: Repository = {
			...repository,
			metadata: {
				groups: {},
				links: { 'Actions Passed': [first, second, ''] },
				values: { 'Actions Passed': ['CI', 'CI', 'Release'] },
			},
		}
		expect(getColumnLinkedItems(expanded, 'metadata:Actions Passed')).toEqual([
			{ label: 'CI', url: new URL(first) },
			{ label: 'CI', url: new URL(second) },
			{ label: 'Release', url: undefined },
		])
		expect(getColumnLinkedItems(repository, 'metadata:Actions Passed')).toBeUndefined()
		expect(getColumnEnvironment(expanded).ALL_WORK_COLUMN_ACTIONS_PASSED).toBe('CI, CI, Release')
	})

	it('blocks only referenced values that are still waiting for metadata', () => {
		expect(getPendingCommandColumns('printf "$ALL_WORK_COLUMN_STARS"', [repository])).toEqual([
			'Stars',
		])
		expect(getPendingCommandColumns(`printf "\${ALL_WORK_COLUMN_PUBLIC}"`, [repository])).toEqual([
			'Public',
		])
		expect(getPendingCommandColumns('pwd', [repository])).toEqual([])
		expect(
			getPendingCommandColumns('printf "$ALL_WORK_COLUMN_STARS"', [
				{ ...repository, metadata: { groups: {}, values: { Stars: 0 } } },
			]),
		).toEqual([])
	})

	it('waits for cached values that are refreshing, but not for refreshed ones', () => {
		const restored = (status: 'loading' | 'queued' | 'ready', cached?: true) => ({
			...repository,
			metadata: {
				groups: { git: { status, ...(cached && { cached }) } },
				values: {},
			},
		})
		const command = 'git push origin "$ALL_WORK_COLUMN_BRANCH"'
		expect(getPendingCommandColumns(command, [restored('queued', true)])).toEqual(['Branch'])
		expect(getPendingCommandColumns(command, [restored('loading', true)])).toEqual(['Branch'])
		expect(getPendingCommandColumns(command, [restored('ready', true)])).toEqual([])
		expect(getPendingCommandColumns(command, [restored('loading')])).toEqual([])
	})

	it('exposes each data column with a shell-safe name and its raw value', () => {
		expect(getColumnEnvironment(repository)).toMatchObject(
			Object.fromEntries([
				['ALL_WORK_COLUMN_REPOSITORY', 'project with spaces'],
				['ALL_WORK_COLUMN_REPO_NAME', 'project'],
				['ALL_WORK_COLUMN_REPO_OWNER', 'example'],
				['ALL_WORK_COLUMN_NAME', '@example/project'],
				['ALL_WORK_COLUMN_DESCRIPTION', 'Example project description'],
				['ALL_WORK_COLUMN_BRANCH', 'feature/example'],
				['ALL_WORK_COLUMN_WORKING_TREE', '4'],
				['ALL_WORK_COLUMN_AHEAD', '2'],
				['ALL_WORK_COLUMN_BEHIND', '3'],
				['ALL_WORK_COLUMN_SYNC', '5'],
				['ALL_WORK_COLUMN_LAST_COMMIT', '2026-10-15T12:00:00.000Z'],
				['ALL_WORK_COLUMN_VERSION', '1.2.3'],
				['ALL_WORK_COLUMN_PACKAGE_MANAGER', 'pnpm@12.11.2'],
				['ALL_WORK_COLUMN_REMOTE', 'git@github.com:example/project.git'],
			]),
		)
	})

	it('uses empty values for unavailable metadata and preserves known numeric zeroes', () => {
		const unavailable = getColumnEnvironment({
			...repository,
			gitStatusAvailable: false,
			lastCommitDate: '',
			version: '',
		})
		expect(unavailable.ALL_WORK_COLUMN_WORKING_TREE).toBe('')
		expect(unavailable.ALL_WORK_COLUMN_SYNC).toBe('')
		expect(unavailable.ALL_WORK_COLUMN_LAST_COMMIT).toBe('')
		expect(unavailable.ALL_WORK_COLUMN_VERSION).toBe('')
		const clean = getColumnEnvironment({ ...repository, ahead: 0, behind: 0, changedFiles: 0 })
		expect(clean.ALL_WORK_COLUMN_WORKING_TREE).toBe('0')
		expect(clean.ALL_WORK_COLUMN_AHEAD).toBe('0')
		expect(clean.ALL_WORK_COLUMN_SYNC).toBe('0')
	})

	it('leaves upstream counts empty without an upstream or when its ref is missing', () => {
		for (const environment of [
			getColumnEnvironment({ ...repository, ahead: 0, behind: 0, upstream: '' }),
			getColumnEnvironment({ ...repository, ahead: 0, behind: 0, upstreamGone: true }),
		]) {
			expect(environment.ALL_WORK_COLUMN_AHEAD).toBe('')
			expect(environment.ALL_WORK_COLUMN_BEHIND).toBe('')
			expect(environment.ALL_WORK_COLUMN_SYNC).toBe('')
		}
	})

	it('names the compared upstream in upstream count tooltips', () => {
		expect(getColumnTooltip(repository, 'ahead')).toContain('Upstream: origin/main')
		expect(getColumnTooltip({ ...repository, upstream: '' }, 'behind')).toContain(
			'No upstream branch',
		)
		expect(getColumnTooltip({ ...repository, upstreamGone: true }, 'sync')).toContain(
			'Upstream origin/main is missing locally',
		)
		expect(getColumnTooltip(repository, 'branch')).not.toContain('Upstream')
	})

	it('adds the path, description, or commit subject to the cells that show them', () => {
		expect(getCellTooltip(repository, 'relativePath')).toBe(
			`${getColumnTooltip(repository, 'relativePath')}\n/workspace/project with spaces`,
		)
		expect(getCellTooltip(repository, 'name').split('\n').at(-1)).toBe(
			'Example project description',
		)
		expect(getCellTooltip(repository, 'lastCommitDate').split('\n').at(-1)).toBe('Example commit')
		expect(getCellTooltip(repository, 'branch')).toBe(getColumnTooltip(repository, 'branch'))
	})

	it('leaves out empty details and describes run and selection cells as empty', () => {
		expect(getCellTooltip({ ...repository, description: '' }, 'name')).toBe(
			getColumnTooltip(repository, 'name'),
		)
		expect(getCellTooltip({ ...repository, lastCommit: '' }, 'lastCommitDate')).toBe(
			getColumnTooltip(repository, 'lastCommitDate'),
		)
		expect(getCellTooltip(repository, 'select')).toBe('')
		expect(getCellTooltip(repository, 'run-id')).toBe('')
	})

	it('distinguishes repeated commands by current run number and includes exact multiline output', () => {
		const runs = [outputRun('first', 'one\ntwo\n'), outputRun('second', 'three\n', 2)]
		const environment = getColumnEnvironment(repository, runs)
		expect(environment.ALL_WORK_COLUMN_RUN_1).toBe('one\ntwo\n')
		expect(environment.ALL_WORK_COLUMN_RUN_2).toBe('three\n')
		expect(
			getColumnEnvironment({ ...repository, id: 'not-targeted' }, runs).ALL_WORK_COLUMN_RUN_1,
		).toBe('')
		expect(getColumnVariables(runs).slice(-2)).toEqual([
			{
				category: 'Runs',
				id: 'first',
				label: 'Run 1: git status --short',
				name: 'ALL_WORK_COLUMN_RUN_1',
			},
			{
				category: 'Runs',
				id: 'second',
				label: 'Run 2: git status --short',
				name: 'ALL_WORK_COLUMN_RUN_2',
			},
		])
	})

	it('keeps a run variable named by its run number after an earlier run is cleared', () => {
		const environment = getColumnEnvironment(repository, [outputRun('second', 'three\n', 2)])
		expect(environment.ALL_WORK_COLUMN_RUN_2).toBe('three\n')
		expect(environment.ALL_WORK_COLUMN_RUN_1).toBeUndefined()
	})

	it('names the variable for repository and run columns, and none for other columns', () => {
		const runs = [outputRun('first', 'one'), outputRun('second', 'two', 2)]
		expect(getColumnVariableName('branch')).toBe('ALL_WORK_COLUMN_BRANCH')
		expect(getColumnVariableName('ahead')).toBe('ALL_WORK_COLUMN_AHEAD')
		expect(getColumnVariableName('metadata:Git Remotes Ahead')).toBe(
			'ALL_WORK_COLUMN_GIT_REMOTES_AHEAD',
		)
		expect(getColumnVariableName('second', runs)).toBe('ALL_WORK_COLUMN_RUN_2')
		expect(getColumnVariableName('select', runs)).toBeUndefined()
		expect(getColumnVariableName('removed-run', runs)).toBeUndefined()
	})

	it('previews a variable with one repository value in the variable picker', () => {
		expect(getVariablePreviewTooltip(repository, 'branch').split('\n', 1)[0]).toBe(
			'$ALL_WORK_COLUMN_BRANCH = feature/example',
		)
		expect(getVariablePreviewTooltip(repository, 'metadata:Stars').split('\n', 1)[0]).toBe(
			'$ALL_WORK_COLUMN_STARS = ""',
		)
		expect(getVariablePreviewTooltip(undefined, 'branch')).toBe('$ALL_WORK_COLUMN_BRANCH')
	})
})

describe('expandCommandVariables', () => {
	const environment = {
		ALL_WORK_COLUMN_BRANCH: 'main',
		ALL_WORK_COLUMN_REPOSITORY: 'Cinder-ImagingSource',
	}
	const expand = (command: string) => expandCommandVariables(command, environment)

	it('fills in quoted, bare, and braced references', () => {
		expect(expand('echo "$ALL_WORK_COLUMN_REPOSITORY"')).toBe('echo "Cinder-ImagingSource"')
		expect(expand('git log $ALL_WORK_COLUMN_BRANCH')).toBe('git log main')
		// eslint-disable-next-line no-template-curly-in-string -- Shell braces, not a JavaScript template
		expect(expand('echo "${ALL_WORK_COLUMN_BRANCH}-next"')).toBe('echo "main-next"')
		expect(expand(`echo "it's $ALL_WORK_COLUMN_BRANCH"`)).toBe(`echo "it's main"`)
	})

	it('leaves references the shell would not expand as typed', () => {
		for (const command of [
			"echo '$ALL_WORK_COLUMN_BRANCH'",
			String.raw`echo \$ALL_WORK_COLUMN_BRANCH`,
			String.raw`echo "\$ALL_WORK_COLUMN_BRANCH"`,
			// eslint-disable-next-line no-template-curly-in-string -- Shell braces, not a JavaScript template
			'echo "${ALL_WORK_COLUMN_BRANCH:-trunk}"',
			'echo "$HOME"',
			"echo 'unterminated $ALL_WORK_COLUMN_BRANCH",
		]) {
			expect(expand(command)).toBe(command)
		}
	})

	it('expands unknown and longer names to nothing, as the shell does', () => {
		expect(expand('echo "[$ALL_WORK_COLUMN_MISSING]"')).toBe('echo "[]"')
		expect(expand('echo $ALL_WORK_COLUMN_BRANCHES')).toBe('echo ')
		expect(expand(String.raw`echo "\\$ALL_WORK_COLUMN_BRANCH"`)).toBe(String.raw`echo "\\main"`)
	})
})
