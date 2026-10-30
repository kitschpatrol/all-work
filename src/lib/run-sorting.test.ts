import { describe, expect, it } from 'vitest'
import type { CommandRun } from './workspace.js'
import { createRunSorting } from './run-sorting.js'

const run: CommandRun = {
	command: 'pnpm test',
	concurrency: 1,
	createdAt: '',
	finished: false,
	id: 'run-1',
	number: 1,
	results: {
		failed: {
			exitCode: 1,
			output: 'failed',
			repositoryId: 'failed',
			status: 'failed',
			truncated: false,
		},
		running: { output: 'partial', repositoryId: 'running', status: 'running', truncated: false },
		succeeded: {
			exitCode: 0,
			output: 'ok',
			repositoryId: 'succeeded',
			status: 'success',
			truncated: false,
		},
	},
}

describe('run column sorting', () => {
	it('sorts by output until a run is set to sort by exit code', () => {
		const sorting = createRunSorting()
		expect(sorting.sortsByExitCode('run-1')).toBe(false)
		expect(sorting.value(run, 'failed')).toBe('failed')
		expect(sorting.value(run, 'missing')).toBe('')
	})

	it('reads exit codes, leaving rows without one undefined', () => {
		const sorting = createRunSorting()
		sorting.set('run-1', true)
		expect(sorting.sortsByExitCode('run-1')).toBe(true)
		expect(sorting.value(run, 'succeeded')).toBe(0)
		expect(sorting.value(run, 'failed')).toBe(1)
		expect(sorting.value(run, 'running')).toBeUndefined()
		expect(sorting.value(run, 'missing')).toBeUndefined()
		sorting.set('run-1', false)
		expect(sorting.value(run, 'succeeded')).toBe('ok')
	})

	it('lists and restores the runs that sort by exit code', () => {
		const sorting = createRunSorting()
		sorting.set('run-1', true)
		sorting.set('run-2', true)
		expect(sorting.runIds).toEqual(['run-1', 'run-2'])
		sorting.restore(['run-3'])
		expect(sorting.runIds).toEqual(['run-3'])
		expect(sorting.sortsByExitCode('run-1')).toBe(false)
		sorting.restore([])
		expect(sorting.runIds).toEqual([])
	})
})
