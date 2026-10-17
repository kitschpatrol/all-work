/* eslint-disable ts/naming-convention -- Frontmatter keys preserve the Metascope template spelling. */
import { describe, expect, it } from 'vitest'
import type { CommandRun, Repository } from './workspace.js'
import {
	formatColumnCellValue,
	getColumnDisplay,
	getColumnEnvironment,
	getColumnVariables,
	getPendingCommandColumns,
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
	relativePath: 'project with spaces',
	remote: 'git@github.com:example/project.git',
	repoName: 'project',
	repoOwner: 'example',
	version: '1.2.3',
}

function outputRun(id: string, output: string): CommandRun {
	return {
		command: 'git status --short',
		concurrency: 1,
		createdAt: '2026-10-15T12:00:00.000Z',
		finished: true,
		id,
		results: {
			[repository.id]: { output, repositoryId: repository.id, status: 'success', truncated: false },
		},
	}
}

describe('column variables', () => {
	it('sets counts as numbers, versions and locations as code, and prose, names, and booleans as text', () => {
		const expected = {
			description: 'text',
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
		expect(getColumnEnvironment(status('author')).ALLWORK_COLUMN_STATUS).toBe('author')
	})

	it('formats expanded metadata and keeps unknown values distinct from zero and false', () => {
		const expanded = {
			...repository,
			metadata: { groups: {}, values: { Public: false, Stars: 0, Tags: ['one', 'two'] } },
		}
		const environment = getColumnEnvironment(expanded)
		expect(environment.ALLWORK_COLUMN_PUBLIC).toBe('false')
		expect(environment.ALLWORK_COLUMN_STARS).toBe('0')
		expect(environment.ALLWORK_COLUMN_TAGS).toBe('one, two')
		expect(environment.ALLWORK_COLUMN_TOTAL_UPDATES).toBe('')
		const variables = getColumnVariables()
		expect(new Set(variables.map((variable) => variable.name)).size).toBe(variables.length)
	})

	it('blocks only referenced values that are still waiting for metadata', () => {
		expect(getPendingCommandColumns('printf "$ALLWORK_COLUMN_STARS"', [repository])).toEqual([
			'Stars',
		])
		expect(getPendingCommandColumns(`printf "\${ALLWORK_COLUMN_PUBLIC}"`, [repository])).toEqual([
			'Public',
		])
		expect(getPendingCommandColumns('pwd', [repository])).toEqual([])
		expect(
			getPendingCommandColumns('printf "$ALLWORK_COLUMN_STARS"', [
				{ ...repository, metadata: { groups: {}, values: { Stars: 0 } } },
			]),
		).toEqual([])
	})

	it('exposes each data column with a shell-safe name and its raw value', () => {
		expect(getColumnEnvironment(repository)).toMatchObject(
			Object.fromEntries([
				['ALLWORK_COLUMN_REPOSITORY', 'project with spaces'],
				['ALLWORK_COLUMN_REPO_NAME', 'project'],
				['ALLWORK_COLUMN_REPO_OWNER', 'example'],
				['ALLWORK_COLUMN_NAME', '@example/project'],
				['ALLWORK_COLUMN_DESCRIPTION', 'Example project description'],
				['ALLWORK_COLUMN_BRANCH', 'feature/example'],
				['ALLWORK_COLUMN_WORKING_TREE', '4'],
				['ALLWORK_COLUMN_SYNC', '5'],
				['ALLWORK_COLUMN_LAST_COMMIT', '2026-10-15T12:00:00.000Z'],
				['ALLWORK_COLUMN_VERSION', '1.2.3'],
				['ALLWORK_COLUMN_PACKAGE_MANAGER', 'pnpm@12.11.2'],
				['ALLWORK_COLUMN_REMOTE', 'git@github.com:example/project.git'],
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
		expect(unavailable.ALLWORK_COLUMN_WORKING_TREE).toBe('')
		expect(unavailable.ALLWORK_COLUMN_SYNC).toBe('')
		expect(unavailable.ALLWORK_COLUMN_LAST_COMMIT).toBe('')
		expect(unavailable.ALLWORK_COLUMN_VERSION).toBe('')
		const clean = getColumnEnvironment({ ...repository, ahead: 0, behind: 0, changedFiles: 0 })
		expect(clean.ALLWORK_COLUMN_WORKING_TREE).toBe('0')
		expect(clean.ALLWORK_COLUMN_SYNC).toBe('0')
	})

	it('distinguishes repeated commands by current run number and includes exact multiline output', () => {
		const runs = [outputRun('first', 'one\ntwo\n'), outputRun('second', 'three\n')]
		const environment = getColumnEnvironment(repository, runs)
		expect(environment.ALLWORK_COLUMN_RUN_1).toBe('one\ntwo\n')
		expect(environment.ALLWORK_COLUMN_RUN_2).toBe('three\n')
		expect(
			getColumnEnvironment({ ...repository, id: 'not-targeted' }, runs).ALLWORK_COLUMN_RUN_1,
		).toBe('')
		expect(getColumnVariables(runs).slice(-2)).toEqual([
			{
				category: 'Runs',
				id: 'first',
				label: 'Run 1: git status --short',
				name: 'ALLWORK_COLUMN_RUN_1',
			},
			{
				category: 'Runs',
				id: 'second',
				label: 'Run 2: git status --short',
				name: 'ALLWORK_COLUMN_RUN_2',
			},
		])
		expect(getColumnEnvironment(repository, runs.slice(1)).ALLWORK_COLUMN_RUN_1).toBe('three\n')
	})
})
