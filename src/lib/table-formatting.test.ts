import { describe, expect, it } from 'vitest'
import type { CommandRun, MetadataGroup, MetadataState, Repository } from './workspace.js'
import { getColumnCopyLines, pendingMetadata } from './table-formatting.js'

function repository(
	id: string,
	groups?: Partial<Record<MetadataGroup, MetadataState['status']>>,
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
		...(groups !== undefined && {
			metadata: {
				groups: Object.fromEntries(
					Object.entries(groups).map(([group, status]) => [group, { status }]),
				),
				values: {},
			},
		}),
		name: id,
		packageManager: '',
		path: `/workspace/${id}`,
		readme: '',
		relativePath: id,
		remote: '',
		repoName: id,
		repoOwner: '',
		version: '',
	}
}

describe('pending metadata', () => {
	it('counts queued and loading groups and the repositories waiting on them', () => {
		expect(
			pendingMetadata([
				repository('a', { git: 'loading', github: 'queued', local: 'ready' }),
				repository('b', { git: 'queued' }),
				repository('c', { git: 'ready', github: 'error', registry: 'unavailable' }),
			]),
		).toEqual({ groups: 3, repositories: 2 })
	})

	it('treats repositories without metadata and empty workspaces as idle', () => {
		expect(pendingMetadata([repository('a')])).toEqual({ groups: 0, repositories: 0 })
		expect(pendingMetadata([])).toEqual({ groups: 0, repositories: 0 })
	})
})

describe('getColumnCopyLines', () => {
	it('copies one plain-text line per row and leaves missing values empty', () => {
		const clean = repository('clean')
		const dirty = { ...repository('dirty'), ahead: 2, changedFiles: 3, version: '1.2.0' }
		const unknown = { ...repository('unknown'), branch: '', gitStatusAvailable: false }
		const rows = [clean, dirty, unknown]
		expect(getColumnCopyLines(rows, 'name', [])).toBe('clean\ndirty\nunknown')
		expect(getColumnCopyLines(rows, 'branch', [])).toBe('main\nmain\n')
		expect(getColumnCopyLines(rows, 'changedFiles', [])).toBe('Clean\n3 Changed\n')
		expect(getColumnCopyLines(rows, 'sync', [])).toBe('↑0 ↓0\n↑2 ↓0\n')
		expect(getColumnCopyLines(rows, 'version', [])).toBe('\n1.2.0\n')
		expect(getColumnCopyLines(rows, 'lastCommitDate', [])).toBe('\n\n')
	})

	it('copies command output for run columns', () => {
		const run = {
			id: 'run',
			results: { clean: { output: 'ok' } },
		} as unknown as CommandRun
		expect(getColumnCopyLines([repository('clean'), repository('other')], 'run', [run])).toBe(
			'ok\n',
		)
	})

	it('copies nothing without rows', () => {
		expect(getColumnCopyLines([], 'name', [])).toBe('')
	})
})
