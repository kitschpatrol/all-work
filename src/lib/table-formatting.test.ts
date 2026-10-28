import { describe, expect, it } from 'vitest'
import type { CommandRun, MetadataGroup, MetadataState, Repository } from './workspace.js'
import {
	getColumnCopyLines,
	pendingMetadata,
	runCellStatus,
	runOutcomes,
} from './table-formatting.js'

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
		upstream: 'origin/main',
		upstreamGone: false,
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
		const untracked = { ...repository('untracked'), upstream: '' }
		const rows = [clean, dirty, unknown, untracked]
		expect(getColumnCopyLines(rows, 'name', [])).toBe('clean\ndirty\nunknown\nuntracked')
		expect(getColumnCopyLines(rows, 'branch', [])).toBe('main\nmain\n\nmain')
		expect(getColumnCopyLines(rows, 'changedFiles', [])).toBe('Clean\n3 Changed\n\nClean')
		expect(getColumnCopyLines(rows, 'sync', [])).toBe('↑0 ↓0\n↑2 ↓0\n\n')
		expect(getColumnCopyLines(rows, 'ahead', [])).toBe('0\n2\n\n')
		expect(getColumnCopyLines(rows, 'version', [])).toBe('\n1.2.0\n\n')
		expect(getColumnCopyLines(rows, 'lastCommitDate', [])).toBe('\n'.repeat(3))
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

describe('runOutcomes', () => {
	function run(...statuses: Array<CommandRun['results'][string]['status']>) {
		return {
			results: Object.fromEntries(statuses.map((status, index) => [String(index), { status }])),
		} as unknown as CommandRun
	}

	it('counts succeeded and failed results, ignoring unfinished and cancelled ones', () => {
		expect(
			runOutcomes(run('success', 'failed', 'success', 'queued', 'running', 'cancelled')),
		).toEqual({ failed: 1, succeeded: 2 })
	})

	it('counts nothing for a run without results', () => {
		expect(runOutcomes(run())).toEqual({ failed: 0, succeeded: 0 })
	})
})

describe('runCellStatus', () => {
	const run = {
		results: {
			cancelled: { status: 'cancelled' },
			failed: { status: 'failed' },
			queued: { status: 'queued' },
			running: { status: 'running' },
			success: { status: 'success' },
		},
	} as unknown as CommandRun

	it('tints running, successful, and failed results', () => {
		expect(runCellStatus(run, 'running')).toBe('running')
		expect(runCellStatus(run, 'success')).toBe('success')
		expect(runCellStatus(run, 'failed')).toBe('failed')
	})

	it('leaves queued, cancelled, and missing results without a tint', () => {
		expect(runCellStatus(run, 'queued')).toBeUndefined()
		expect(runCellStatus(run, 'cancelled')).toBeUndefined()
		expect(runCellStatus(run, 'absent')).toBeUndefined()
	})
})
