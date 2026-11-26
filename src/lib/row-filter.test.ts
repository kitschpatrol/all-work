/* eslint-disable ts/naming-convention -- Frontmatter keys preserve the Metascope template spelling. */
import { describe, expect, it } from 'vitest'
import type { ProjectIdentity } from './preferences.js'
import type { FilterGroup, FilterNode, FilterRule } from './row-filter.js'
import type {
	CommandRun,
	MetadataGroup,
	MetadataState,
	MetadataValue,
	Repository,
} from './workspace.js'
import {
	changeOperator,
	comparisonKey,
	createRule,
	getCategoryValues,
	getComparisons,
	getOperatorLabel,
	getOperators,
	retargetRule,
	selectedComparison,
} from './filter-comparisons.js'
import { getPresetFilter } from './filter-presets.js'
import {
	compileFilter,
	countActiveRules,
	getFilterColumns,
	getFilterMetadataGroups,
	getValueSuggestions,
	isRuleActive,
	parseFilter,
	pruneFilter,
} from './row-filter.js'

const ready: MetadataState = { status: 'ready' }
const now = new Date(2026, 9, 16, 12).getTime()
const identity: ProjectIdentity = {
	authorNames: ['Eric Mika', 'kitschpatrol'],
	githubAccounts: ['KitschPatrol', 'slopforest'],
}

const loadedGroups: Partial<Record<MetadataGroup, MetadataState>> = {
	git: ready,
	github: ready,
	local: ready,
}

function repository(
	id: string,
	fields: Partial<Repository> = {},
	values: Record<string, MetadataValue> = {},
	groups = loadedGroups,
): Repository {
	return {
		ahead: 0,
		behind: 0,
		branch: 'main',
		changedFiles: 0,
		description: '',
		gitStatusAvailable: true,
		id,
		lastCommit: '',
		lastCommitDate: '',
		metadata: { groups, values },
		name: id,
		packageManager: '',
		path: `/workspace/${id}`,
		readme: '',
		relativePath: id,
		remote: '',
		repoName: id,
		repoOwner: '',
		upstream: '',
		upstreamGone: false,
		version: '',
		website: '',
		...fields,
	}
}

function all(...rules: FilterNode[]): FilterGroup {
	return { match: 'all', rules }
}

function any(...rules: FilterNode[]): FilterGroup {
	return { match: 'any', rules }
}

function none(...rules: FilterNode[]): FilterGroup {
	return { match: 'none', rules }
}

function rule(
	column: string,
	operator: FilterRule['operator'],
	value = '',
	extra = {},
): FilterRule {
	return { column, operator, value, ...extra }
}

function evaluate(filter: FilterGroup, row: Repository, runs: CommandRun[] = []) {
	const predicate = compileFilter(filter, runs, identity, now)
	if (predicate === undefined) {
		throw new Error('Expected the filter to have active rules')
	}

	return predicate(row)
}

function run(results: CommandRun['results']): CommandRun {
	return {
		command: 'git status --short',
		concurrency: 1,
		createdAt: '2026-10-16T12:00:00.000Z',
		finished: false,
		id: 'run-1',
		number: 1,
		results,
	}
}

describe('compiling filters', () => {
	it('matches everything when no rule is complete', () => {
		expect(compileFilter(all(), [], identity, now)).toBeUndefined()
		expect(
			compileFilter(all(rule('branch', 'contains'), any(rule('name', 'is'))), [], identity, now),
		).toBeUndefined()
	})

	it('ignores rules on missing columns, mismatched operators, and invalid operands', () => {
		const ignored = [
			rule('missing', 'contains', 'x'),
			rule('branch', 'greaterThan', '1'),
			rule('changedFiles', 'is', 'many'),
			rule('branch', 'matches', '('),
			rule('lastCommitDate', 'before', '2026-02-30'),
			rule('lastCommitDate', 'inLast', '1.5'),
			rule('lastCommitDate', 'notInLast', '1e308'),
			rule('changedFiles', 'between', '1'),
			rule('name', 'isMe'),
		]
		expect(
			ignored.filter((entry) => compileFilter(all(entry), [], identity, now) !== undefined),
		).toEqual([])
	})

	it('matches repository owners against your GitHub accounts without regard to case', () => {
		const rows = [
			repository('mine', { repoOwner: 'kitschpatrol' }),
			repository('studio', { repoOwner: 'SlopForest' }),
			repository('theirs', { repoOwner: 'someone' }),
			repository('local'),
		]
		const results = (filter: FilterGroup) => rows.map((row) => evaluate(filter, row))
		expect(results(all(rule('repoOwner', 'isMe')))).toEqual([true, true, false, false])
		expect(results(all(rule('repoOwner', 'isNotMe')))).toEqual([false, false, true, true])
		expect(results(all(rule('repoOwner', 'is', 'SOMEONE')))).toEqual([false, false, true, false])
		expect(isRuleActive(rule('repoOwner', 'isMe'), [])).toBe(true)
	})

	it('matches Account metadata against your GitHub accounts independently of the repo owner', () => {
		const rows = [
			repository('mine', { repoOwner: 'someone' }, { Account: 'kitschpatrol' }),
			repository('studio', {}, { Account: 'SlopForest' }),
			repository('theirs', { repoOwner: 'kitschpatrol' }, { Account: 'someone' }),
			repository('local'),
		]
		const results = (filter: FilterGroup) => rows.map((row) => evaluate(filter, row))
		expect(results(all(rule('metadata:Account', 'isMe')))).toEqual([true, true, false, false])
		expect(results(all(rule('metadata:Account', 'isNotMe')))).toEqual([false, false, true, true])
		expect(results(all(rule('metadata:Account', 'is', 'SOMEONE')))).toEqual([
			false,
			false,
			true,
			false,
		])
	})

	it('matches no owner or author as you when no identity is set', () => {
		const nobody = { authorNames: [], githubAccounts: [] }
		const mine = repository(
			'mine',
			{ repoOwner: 'kitschpatrol' },
			{ Account: 'kitschpatrol', Author: ['Eric Mika'] },
		)
		const owner = compileFilter(all(rule('repoOwner', 'isMe')), [], nobody, now)
		const account = compileFilter(all(rule('metadata:Account', 'isMe')), [], nobody, now)
		const author = compileFilter(all(rule('metadata:Author', 'includesMe')), [], nobody, now)
		expect(owner?.(mine)).toBe(false)
		expect(account?.(mine)).toBe(false)
		expect(author?.(mine)).toBe(false)
	})

	it('finds your author names in Author, Contributor, and Maintainer without regard to case', () => {
		const rows = [
			repository('authored', {}, { Author: ['eric mika', 'Ada Lovelace'] }),
			repository('contributed', {}, { Contributor: ['Grace Hopper', 'KITSCHPATROL'] }),
			repository('maintained', {}, { Maintainer: ['Eric Mika'] }),
			repository('theirs', {}, { Author: ['someone'] }),
			repository('anonymous'),
		]
		const results = (filter: FilterGroup) => rows.map((row) => evaluate(filter, row))
		const people = ['metadata:Author', 'metadata:Contributor', 'metadata:Maintainer']
		expect(results(any(...people.map((column) => rule(column, 'includesMe'))))).toEqual([
			true,
			true,
			true,
			false,
			false,
		])
		expect(results(all(rule('metadata:Author', 'doesNotIncludeMe')))).toEqual([
			false,
			true,
			true,
			true,
			true,
		])
		expect(results(all(rule('metadata:Author', 'includes', 'SOMEONE')))).toEqual([
			false,
			false,
			false,
			true,
			false,
		])
	})

	it('matches "is me" on people columns only when every listed name is yours', () => {
		const rows = [
			repository('sole', {}, { Maintainer: ['Eric Mika'] }),
			repository('aliases', {}, { Maintainer: ['eric mika', 'Kitschpatrol'] }),
			repository('shared', {}, { Maintainer: ['Eric Mika', 'Ada Lovelace'] }),
			repository('theirs', {}, { Maintainer: ['Ada Lovelace'] }),
			repository('unmaintained'),
		]
		expect(rows.map((row) => evaluate(all(rule('metadata:Maintainer', 'isMe')), row))).toEqual([
			true,
			true,
			false,
			false,
			false,
		])
	})

	it('leaves owner and author rules undecided until local metadata loads', () => {
		const loading = repository('loading', {}, {}, { local: { status: 'loading' } })
		expect(evaluate(all(rule('repoOwner', 'isNotMe')), loading)).toBeUndefined()
		expect(evaluate(all(rule('metadata:Author', 'doesNotIncludeMe')), loading)).toBeUndefined()
	})

	it('leaves Account identity rules undecided until GitHub metadata loads', () => {
		const loading = repository('loading', {}, {}, { github: { status: 'loading' } })
		expect(evaluate(all(rule('metadata:Account', 'isMe')), loading)).toBeUndefined()
		expect(evaluate(all(rule('metadata:Account', 'isNotMe')), loading)).toBeUndefined()
		expect(getFilterMetadataGroups(all(rule('metadata:Account', 'isMe')), [])).toEqual(['github'])
	})

	it('compares text without regard to case', () => {
		const row = repository('alpha', { branch: 'Feature/Login' })
		expect(evaluate(all(rule('branch', 'contains', 'LOGIN')), row)).toBe(true)
		expect(evaluate(all(rule('branch', 'is', 'feature/login')), row)).toBe(true)
		expect(evaluate(all(rule('branch', 'isNot', 'feature/login')), row)).toBe(false)
		expect(evaluate(all(rule('branch', 'startsWith', 'feat')), row)).toBe(true)
		expect(evaluate(all(rule('branch', 'endsWith', 'in')), row)).toBe(true)
		expect(evaluate(all(rule('branch', 'doesNotContain', 'main')), row)).toBe(true)
		expect(evaluate(all(rule('branch', 'matches', String.raw`^feature/\w+$`)), row)).toBe(true)
		expect(evaluate(all(rule('description', 'isEmpty')), row)).toBe(true)
		expect(evaluate(all(rule('description', 'isNotEmpty')), row)).toBe(false)
	})

	it('compares numbers and never matches an absent number', () => {
		const dirty = repository('dirty', { changedFiles: 3 })
		const unavailable = repository('unavailable', { gitStatusAvailable: false })
		expect(evaluate(all(rule('changedFiles', 'greaterThan', '0')), dirty)).toBe(true)
		expect(evaluate(all(rule('changedFiles', 'atMost', '3')), dirty)).toBe(true)
		expect(evaluate(all(rule('changedFiles', 'between', '5', { end: '3' })), dirty)).toBe(true)
		expect(evaluate(all(rule('changedFiles', 'between', '4', { end: '9' })), dirty)).toBe(false)
		expect(evaluate(all(rule('changedFiles', 'is', '0')), unavailable)).toBe(false)
		expect(evaluate(all(rule('changedFiles', 'isNot', '0')), unavailable)).toBe(false)
		expect(evaluate(all(rule('changedFiles', 'isEmpty')), unavailable)).toBe(true)
		expect(
			evaluate(all(rule('metadata:Stars', 'atLeast', '10')), repository('x', {}, { Stars: 12 })),
		).toBe(true)
	})

	it('tests yes or no values and treats a missing one as empty', () => {
		const fork = repository('fork', {}, { Fork: true })
		const unknown = repository('unknown')
		expect(evaluate(all(rule('metadata:Fork', 'isYes')), fork)).toBe(true)
		expect(evaluate(all(rule('metadata:Fork', 'isNo')), fork)).toBe(false)
		expect(evaluate(all(rule('metadata:Fork', 'isNo')), unknown)).toBe(false)
		expect(evaluate(all(rule('metadata:Fork', 'isEmpty')), unknown)).toBe(true)
	})

	it('matches whole list items rather than substrings', () => {
		const row = repository('alpha', {}, { Dependencies: ['svelte-check', 'Svelte'] })
		const bare = repository('bare', {}, { Dependencies: [] })
		expect(evaluate(all(rule('metadata:Dependencies', 'includes', 'svelte')), row)).toBe(true)
		expect(evaluate(all(rule('metadata:Dependencies', 'includes', 'svelte-')), row)).toBe(false)
		expect(evaluate(all(rule('metadata:Dependencies', 'doesNotInclude', 'react')), row)).toBe(true)
		expect(evaluate(all(rule('metadata:Dependencies', 'doesNotInclude', 'react')), bare)).toBe(true)
		expect(evaluate(all(rule('metadata:Dependencies', 'isEmpty')), bare)).toBe(true)
	})

	it('filters Actions names as list items and their counts as numbers', () => {
		const row = repository(
			'project',
			{},
			{
				'Actions Failed': [],
				'Actions Failed Count': 0,
				'Actions Passed': ['CI', 'Build, Windows'],
				'Actions Passed Count': 2,
			},
			{ ci: ready },
		)
		expect(evaluate(all(rule('metadata:Actions Passed', 'includes', 'Build, Windows')), row)).toBe(
			true,
		)
		expect(evaluate(all(rule('metadata:Actions Passed', 'includes', 'Build')), row)).toBe(false)
		expect(evaluate(all(rule('metadata:Actions Passed Count', 'greaterThan', '1')), row)).toBe(true)
		expect(evaluate(all(rule('metadata:Actions Failed Count', 'is', '0')), row)).toBe(true)
		expect(evaluate(all(rule('metadata:Actions Failed', 'isEmpty')), row)).toBe(true)
	})

	it('compares dates by local calendar day and relative to now', () => {
		const row = repository('alpha', { lastCommitDate: new Date(2026, 9, 1, 9).toISOString() })
		expect(evaluate(all(rule('lastCommitDate', 'before', '2026-10-01')), row)).toBe(false)
		expect(evaluate(all(rule('lastCommitDate', 'before', '2026-10-02')), row)).toBe(true)
		expect(evaluate(all(rule('lastCommitDate', 'after', '2026-10-01')), row)).toBe(false)
		expect(evaluate(all(rule('lastCommitDate', 'after', '2026-09-30')), row)).toBe(true)
		expect(evaluate(all(rule('lastCommitDate', 'inLast', '14')), row)).toBe(false)
		expect(evaluate(all(rule('lastCommitDate', 'inLast', '3', { unit: 'weeks' })), row)).toBe(true)
		expect(evaluate(all(rule('lastCommitDate', 'notInLast', '1', { unit: 'months' })), row)).toBe(
			false,
		)
		expect(evaluate(all(rule('lastCommitDate', 'notInLast', '1')), repository('empty'))).toBe(false)
	})

	it('matches a whole local day including date-only metadata', () => {
		const day = all(rule('lastCommitDate', 'on', '2026-03-08'))
		for (const [date, matches] of [
			['2026-03-08', true],
			[new Date(2026, 2, 8, 23, 59, 59).toISOString(), true],
			[new Date(2026, 2, 9).toISOString(), false],
			['', false],
		] as const) {
			expect(evaluate(day, repository('day', { lastCommitDate: date }))).toBe(matches)
		}
	})

	it.each([
		[new Date(2026, 2, 31, 12), 'months', new Date(2026, 1, 28, 12)],
		[new Date(2024, 1, 29, 12), 'years', new Date(2023, 1, 28, 12)],
	] as const)(
		'clamps calendar windows ending at %s and excludes future timestamps',
		(end, unit, start) => {
			const inside = compileFilter(
				all(rule('lastCommitDate', 'inLast', '1', { unit })),
				[],
				identity,
				end.getTime(),
			)
			const outside = compileFilter(
				all(rule('lastCommitDate', 'notInLast', '1', { unit })),
				[],
				identity,
				end.getTime(),
			)
			for (const [time, matches] of [
				[start.getTime() - 1, false],
				[start.getTime(), true],
				[end.getTime(), true],
				[end.getTime() + 1, false],
			] as const) {
				const row = repository('dated', { lastCommitDate: new Date(time).toISOString() })
				expect(inside?.(row)).toBe(matches)
				expect(outside?.(row)).toBe(!matches)
			}
		},
	)
})

describe('loading metadata', () => {
	const loading = repository(
		'loading',
		{ branch: '', gitStatusAvailable: false },
		{},
		{ git: { status: 'loading' }, local: ready },
	)
	const pending = all(rule('changedFiles', 'greaterThan', '0'))

	it('leaves a row undecided while a value it needs is loading', () => {
		expect(evaluate(pending, loading)).toBeUndefined()
		expect(evaluate(none(rule('changedFiles', 'greaterThan', '0')), loading)).toBeUndefined()
		expect(evaluate(all(rule('metadata:Stars', 'atLeast', '1')), loading)).toBeUndefined()
	})

	it('decides a row once any known rule settles the group', () => {
		const known = rule('name', 'is', 'loading')
		expect(evaluate(any(known, pending), loading)).toBe(true)
		expect(evaluate(all(rule('name', 'is', 'other'), pending), loading)).toBe(false)
		expect(evaluate(all(known, pending), loading)).toBeUndefined()
		expect(evaluate(none(known, pending), loading)).toBe(false)
	})

	it('uses a loaded value while its group refreshes', () => {
		const refreshing = repository(
			'refreshing',
			{ changedFiles: 2 },
			{},
			{ git: { status: 'loading' } },
		)
		expect(evaluate(pending, refreshing)).toBe(true)
	})

	it('treats unavailable metadata as empty rather than pending', () => {
		const unavailable = repository('x', {}, {}, { github: { status: 'unavailable' }, local: ready })
		expect(evaluate(all(rule('metadata:Stars', 'isEmpty')), unavailable)).toBe(true)
	})
})

describe('combining rules', () => {
	const alpha = repository('alpha', { branch: 'main', changedFiles: 2 })
	const beta = repository('beta', { branch: 'develop', changedFiles: 0 })
	const isMain = rule('branch', 'is', 'main')
	const isDirty = rule('changedFiles', 'greaterThan', '0')

	it('requires all, any, or none of a group', () => {
		expect([alpha, beta].map((row) => evaluate(all(isMain, isDirty), row))).toEqual([true, false])
		expect(
			[alpha, beta].map((row) => evaluate(any(rule('branch', 'is', 'develop'), isDirty), row)),
		).toEqual([true, true])
		expect([alpha, beta].map((row) => evaluate(none(isMain, isDirty), row))).toEqual([false, true])
	})

	it('nests groups to any depth and skips empty ones', () => {
		const filter = all(
			any(),
			any(isMain, none(any(rule('name', 'is', 'beta')))),
			rule('relativePath', 'contains', 'a'),
		)
		expect(evaluate(filter, alpha)).toBe(true)
		expect(evaluate(filter, beta)).toBe(false)
		expect(countActiveRules(filter, [])).toBe(3)
	})
})

describe('filtering run output', () => {
	const results: CommandRun['results'] = {
		done: { output: 'M src/app.ts\n', repositoryId: 'done', status: 'success', truncated: false },
		failed: {
			output: 'fatal: not a repo',
			repositoryId: 'failed',
			status: 'failed',
			truncated: false,
		},
		queued: { output: '', repositoryId: 'queued', status: 'queued', truncated: false },
		running: { output: 'partial', repositoryId: 'running', status: 'running', truncated: false },
	}
	const runs = [run(results)]
	const rows = ['done', 'failed', 'queued', 'running', 'skipped'].map((id) => repository(id))

	it('matches command status, counting queued commands as running', () => {
		const statuses = rows.map((row) =>
			evaluate(all(rule('run-1', 'statusIs', 'running')), row, runs),
		)
		expect(statuses).toEqual([false, false, true, true, false])
		expect(evaluate(all(rule('run-1', 'statusIs', 'notIncluded')), rows[4]!, runs)).toBe(true)
		expect(evaluate(all(rule('run-1', 'statusIsNot', 'failed')), rows[1]!, runs)).toBe(false)
	})

	it('waits for a command to finish before testing its output', () => {
		const filter = all(rule('run-1', 'matches', String.raw`^M\s`))
		expect(rows.map((row) => evaluate(filter, row, runs))).toEqual([
			true,
			false,
			undefined,
			undefined,
			false,
		])
		expect(evaluate(all(rule('run-1', 'isEmpty')), rows[4]!, runs)).toBe(true)
	})

	it('ignores rules on deleted runs', () => {
		expect(
			compileFilter(all(rule('run-2', 'statusIs', 'failed')), runs, identity, now),
		).toBeUndefined()
	})
})

describe('editing rules', () => {
	const columns = getFilterColumns([run({})])
	const column = (id: string) => {
		const found = columns.find((entry) => entry.id === id)
		if (found === undefined) {
			throw new Error(`Missing column ${id}`)
		}

		return found
	}

	it('lists every repository column and each run', () => {
		expect(column('metadata:Stars').kind).toBe('number')
		expect(column('metadata:Tags').kind).toBe('list')
		expect(column('metadata:Created').kind).toBe('date')
		expect(column('run-1')).toMatchObject({
			category: 'Runs',
			header: 'Run 1: git status --short',
			kind: 'output',
		})
	})

	it('starts each kind with its first operator', () => {
		expect(createRule(column('branch'))).toEqual({
			column: 'branch',
			operator: 'is',
			value: '',
		})
		expect(createRule(column('run-1')).operator).toBe('statusIs')
		expect(createRule(column('metadata:Fork')).operator).toBe('isYes')
	})

	it('restores named helpers and keeps the generic operand editable when it also matches a helper', () => {
		const dirty = createRule(column('changedFiles'))
		const choices = getComparisons('changedFiles', 'number')
		expect(choices.slice(0, 2).map((entry) => entry.label)).toEqual(['is dirty', 'is clean'])
		expect(comparisonKey(selectedComparison(choices, dirty, false))).toBe('greaterThan:0')
		expect(comparisonKey(selectedComparison(choices, dirty, true))).toBe('greaterThan')
		expect(selectedComparison(choices, rule('changedFiles', 'is', '0'), false).label).toBe(
			'is clean',
		)
	})

	it.each(['atLeast', 'atMost'] as const)(
		'preserves a saved %s without offering it for new rules',
		(operator) => {
			const columnId = 'metadata:Libyears'
			const original = all(rule(columnId, operator, '1.5'))
			const restored = parseFilter(original)
			expect(restored).toEqual(original)
			expect(getComparisons(columnId, 'number').map((entry) => entry.operator)).not.toContain(
				operator,
			)
			expect(getComparisons(columnId, 'number', operator).map((entry) => entry.operator)).toContain(
				operator,
			)
			expect(evaluate(restored, repository('decimal', {}, { Libyears: 1.5 }))).toBe(true)
		},
	)

	it('offers identity comparisons only on account, owner, and people columns', () => {
		for (const id of ['metadata:Account', 'repoOwner']) {
			expect(column(id).kind).toBe('account')
			expect(createRule(column(id)).operator).toBe('isMe')
		}

		expect(getOperators('text')).not.toContain('isMe')
		expect(getOperatorLabel('account', 'isMe', false)).toBe('is mine')
		expect(getOperatorLabel('account', 'isNotMe', false)).toBe('is not mine')
		for (const id of ['metadata:Author', 'metadata:Contributor', 'metadata:Maintainer']) {
			expect(column(id).kind).toBe('people')
		}

		expect(createRule(column('metadata:Author')).operator).toBe('includesMe')
		expect(getOperators('people')).toContain('includesMe')
		expect(column('metadata:Tags').kind).toBe('list')
		expect(getOperators('list')).not.toContain('includesMe')
		expect(getOperatorLabel('people', 'doesNotIncludeMe', false)).toBe('does not include me')
	})

	it('offers categories before metadata loads and preserves older free-text rules', () => {
		expect(getCategoryValues('metadata:CI', 'is')).toContain('Timed Out')
		expect(getCategoryValues('metadata:Status', 'isNot')).toContain('Unknown')
		expect(getCategoryValues('metadata:Status', 'matches')).toBeUndefined()
		expect(getComparisons('metadata:CI', 'text').map((choice) => choice.operator)).toEqual([
			'is',
			'isNot',
			'isEmpty',
			'isNotEmpty',
		])
		expect(
			getComparisons('metadata:CI', 'text', 'matches').map((choice) => choice.operator),
		).toContain('matches')
		expect(
			retargetRule(rule('metadata:CI', 'is', 'Failure'), 'text', column('metadata:Status')),
		).toEqual(rule('metadata:Status', 'is'))
		const filter = all(rule('metadata:Status', 'is', 'Unknown'))
		expect(evaluate(filter, repository('classified', {}, { Status: 'unknown' }))).toBe(true)
		expect(evaluate(filter, repository('absent'))).toBe(false)
	})

	it('offers only reported LFS states and labels availability separately from false', () => {
		expect(getComparisons('metadata:Git LFS', 'boolean').map((choice) => choice.label)).toEqual([
			'LFS detected',
			'no detection result',
		])
		expect(getOperatorLabel('boolean', 'isEmpty', false)).toBe('is unknown')
		expect(getOperatorLabel('people', 'isMe', true)).toBe('includes only me')
		expect(
			getComparisons('metadata:Git LFS', 'boolean', 'isNo').map((choice) => choice.operator),
		).toContain('isNo')
	})

	it('marks comparisons that need a value with an ellipsis until selected', () => {
		expect(getOperatorLabel('list', 'includes', false)).toBe('includes…')
		expect(getOperatorLabel('list', 'includes', true)).toBe('includes')
		expect(getOperatorLabel('number', 'is', false)).toBe('is…')
		expect(getOperatorLabel('number', 'between', false)).toBe('is between…')
		expect(getOperatorLabel('date', 'inLast', false)).toBe('is within the last…')
		expect(getOperatorLabel('output', 'contains', false)).toBe('output contains…')
		expect(getOperatorLabel('output', 'statusIs', false)).toBe('status is…')
		expect(getOperatorLabel('people', 'includesMe', false)).toBe('includes me')
		expect(getOperatorLabel('text', 'isEmpty', false)).toBe('is empty')
		expect(getOperatorLabel('boolean', 'isYes', false)).toBe('is Yes')
	})

	it('keeps a comparison when the new column offers it with the same kind of value', () => {
		const contains = rule('name', 'contains', 'kit')
		expect(retargetRule(contains, 'text', column('repoOwner'))).toEqual({
			...contains,
			column: 'repoOwner',
		})
		expect(retargetRule(rule('repoOwner', 'isMe'), 'account', column('name'))).toEqual({
			column: 'name',
			operator: 'contains',
			value: '',
		})
		const includes = rule('metadata:Tags', 'includes', 'cli')
		expect(retargetRule(includes, 'list', column('metadata:Author'))).toEqual({
			...includes,
			column: 'metadata:Author',
		})
		expect(
			retargetRule(rule('metadata:Author', 'includesMe'), 'people', column('metadata:Tags')),
		).toEqual({
			column: 'metadata:Tags',
			operator: 'includes',
			value: '',
		})
	})

	it('keeps the value when moving between columns of the same kind', () => {
		const original = rule('branch', 'is', 'main')
		expect(retargetRule(original, 'text', column('name'))).toEqual({ ...original, column: 'name' })
		expect(retargetRule(original, 'text', column('changedFiles'))).toEqual({
			column: 'changedFiles',
			operator: 'greaterThan',
			value: '0',
		})
	})

	it('clears a value whose format the new operator cannot use', () => {
		const days = rule('lastCommitDate', 'inLast', '30', { unit: 'weeks' })
		expect(changeOperator(days, 'date', 'notInLast')).toEqual({ ...days, operator: 'notInLast' })
		expect(changeOperator(days, 'date', 'before')).toEqual({
			column: 'lastCommitDate',
			operator: 'before',
			value: '',
		})
		expect(changeOperator(rule('run-1', 'contains', 'x'), 'output', 'statusIs').value).toBe(
			'failed',
		)
	})
})

describe('maintaining filters', () => {
	it('drops rules on removed columns and the groups they leave empty', () => {
		const filter = all(
			rule('branch', 'is', 'main'),
			rule('run-1', 'statusIs', 'failed'),
			any(rule('run-1', 'isEmpty'), none(rule('run-1', 'isEmpty'))),
		)
		expect(pruneFilter(filter, ['branch'])).toEqual(all(rule('branch', 'is', 'main')))
	})

	it('reports the metadata groups active rules read', () => {
		const filter = all(
			rule('metadata:Stars', 'atLeast', '1'),
			any(rule('metadata:CI', 'is', 'Failure'), rule('branch', 'is', 'main')),
			rule('metadata:Published', 'isYes'),
			rule('metadata:Forks', 'atLeast', ''),
		)
		expect(getFilterMetadataGroups(filter, []).toSorted()).toEqual([
			'ci',
			'git',
			'github',
			'registry',
		])
	})

	it('suggests common text values and individual list items', () => {
		const rows = [
			repository('a', { branch: 'main' }, { Tags: ['cli', 'git', 'GIT'] }),
			repository('b', { branch: 'main' }, { Tags: ['Git'] }),
			repository('c', { branch: 'develop' }, { Tags: [] }),
			repository('d', { branch: '' }),
		]
		expect(getValueSuggestions('branch', rows)).toEqual([
			{ count: 2, value: 'main' },
			{ count: 1, value: 'develop' },
		])
		expect(getValueSuggestions('metadata:Tags', rows)).toEqual([
			{ count: 2, value: 'git' },
			{ count: 1, value: 'cli' },
		])
		expect(getValueSuggestions('changedFiles', rows)).toEqual([])
	})
})

describe('saved filters', () => {
	it('restores valid rules and drops malformed ones', () => {
		expect(parseFilter(undefined)).toEqual(all())
		expect(parseFilter([])).toEqual(all())
		expect(
			parseFilter({
				match: 'some',
				rules: [
					{ column: 'branch', operator: 'is', value: 'main' },
					{ column: 'branch', operator: 'resembles', value: 'main' },
					{ column: 3, operator: 'is' },
					{ column: 'lastCommitDate', end: 4, operator: 'inLast', unit: 'decades', value: 7 },
					{ match: 'none', rules: 'nope' },
					'rule',
				],
			}),
		).toEqual(all(rule('branch', 'is', 'main'), rule('lastCommitDate', 'inLast', ''), none()))
	})

	it('limits nesting depth from hand-edited settings', () => {
		let deep: FilterGroup = all(rule('branch', 'is', 'main'))
		for (let index = 0; index < 100; index++) {
			deep = any(deep)
		}

		let depth = 0
		let node: FilterNode | undefined = parseFilter(deep)
		while (node !== undefined && 'rules' in node) {
			depth++
			node = node.rules[0]
		}

		expect(depth).toBe(33)
	})

	it('filters working trees like the presets describe', () => {
		const dirty = repository('dirty', { changedFiles: 1 })
		const clean = repository('clean')
		const unavailable = repository('unavailable', { gitStatusAvailable: false })
		const results = (id: 'changed' | 'clean') =>
			[dirty, clean, unavailable].map((row) => evaluate(getPresetFilter(id), row))
		expect(results('changed')).toEqual([true, false, false])
		expect(results('clean')).toEqual([false, true, false])
	})

	it('finds repositories ahead of or behind their upstream', () => {
		const tracked = { upstream: 'origin/main' }
		const rows = [
			repository('ahead', { ...tracked, ahead: 2 }),
			repository('behind', { ...tracked, behind: 1 }),
			repository('synced', tracked),
			repository('untracked', { ahead: 3 }),
			repository('gone', { ...tracked, ahead: 1, upstreamGone: true }),
		]
		expect(rows.map((row) => evaluate(getPresetFilter('outOfSync'), row))).toEqual([
			true,
			true,
			false,
			false,
			false,
		])
	})

	it('requires a known upstream with commits in both directions for divergence', () => {
		const filter = all(rule('sync', 'hasDiverged'))
		const tracked = { ahead: 2, behind: 1, upstream: 'origin/main' }
		for (const [fields, matches] of [
			[tracked, true],
			[{ ...tracked, ahead: 0 }, false],
			[{ ...tracked, behind: 0 }, false],
			[{ ...tracked, upstream: '' }, false],
			[{ ...tracked, upstreamGone: true }, false],
		] as const) {
			expect(evaluate(filter, repository('repo', fields))).toBe(matches)
		}

		const pending = repository(
			'loading',
			{ gitStatusAvailable: false },
			{},
			{ git: { status: 'loading' } },
		)
		expect(evaluate(none(filter), pending)).toBeUndefined()
		expect(isRuleActive(rule('ahead', 'hasDiverged'), [])).toBe(false)
	})

	it('separates dependency scans that never started from pending, completed and unavailable results', () => {
		const columnId = 'metadata:Total Updates'
		const filter = all(rule(columnId, 'notScanned'))
		expect(evaluate(filter, repository('new'))).toBe(true)
		for (const status of ['queued', 'loading'] as const) {
			const pending = repository('pending', {}, {}, { updates: { status } })
			expect(evaluate(none(filter), pending)).toBeUndefined()
			expect(evaluate(any(filter, rule('name', 'is', 'pending')), pending)).toBe(true)
		}

		for (const status of ['ready', 'unavailable', 'error'] as const) {
			expect(evaluate(filter, repository('checked', {}, {}, { updates: { status } }))).toBe(false)
		}

		const checked = repository(
			'cached',
			{},
			{ 'Total Updates': 0 },
			{ updates: { status: 'loading' } },
		)
		expect(evaluate(filter, checked)).toBe(false)
		expect(evaluate(all(rule(columnId, 'is', '0')), checked)).toBe(true)
		expect(isRuleActive(rule('metadata:Stars', 'notScanned'), [])).toBe(false)
	})

	it('finds clean repositories with commits to push and nothing to pull', () => {
		const tracked = { upstream: 'origin/main' }
		const rows = [
			repository('ready', { ...tracked, ahead: 2 }),
			repository('diverged', { ...tracked, ahead: 2, behind: 1 }),
			repository('dirty', { ...tracked, ahead: 2, changedFiles: 1 }),
			repository('synced', tracked),
			repository('untracked', { ahead: 2 }),
		]
		expect(rows.map((row) => evaluate(getPresetFilter('readyToPush'), row))).toEqual([
			true,
			false,
			false,
			false,
			false,
		])
	})

	it('finds repositories with a GitHub remote', () => {
		const rows = [
			repository('ssh', { remote: 'git@github.com:kitschpatrol/all-work.git' }),
			repository('https', { remote: 'https://GitHub.com/kitschpatrol/all-work' }),
			repository('elsewhere', { remote: 'https://gitlab.com/someone/github-tools.git' }),
			repository('local'),
		]
		expect(rows.map((row) => evaluate(getPresetFilter('github'), row))).toEqual([
			true,
			true,
			false,
			false,
		])
	})

	it('finds repositories you authored or own', () => {
		const rows = [
			repository('authored', { repoOwner: 'someone' }, { Author: ['Ada Lovelace', 'Eric Mika'] }),
			repository('owned', { repoOwner: 'kitschpatrol' }, { Author: ['Ada Lovelace'] }),
			repository('theirs', { repoOwner: 'someone' }, { Author: ['Ada Lovelace'] }),
			repository('local'),
		]
		expect(rows.map((row) => evaluate(getPresetFilter('mine'), row))).toEqual([
			true,
			true,
			false,
			false,
		])
	})

	it('finds clean repositories with commits to pull and nothing to push', () => {
		const tracked = { upstream: 'origin/main' }
		const rows = [
			repository('ready', { ...tracked, behind: 2 }),
			repository('diverged', { ...tracked, ahead: 1, behind: 2 }),
			repository('dirty', { ...tracked, behind: 2, changedFiles: 1 }),
			repository('synced', tracked),
			repository('untracked', { behind: 2 }),
		]
		expect(rows.map((row) => evaluate(getPresetFilter('readyToPull'), row))).toEqual([
			true,
			false,
			false,
			false,
			false,
		])
	})
})
