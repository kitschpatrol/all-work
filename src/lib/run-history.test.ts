import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandRun } from './workspace.js'
import { request } from './client-request.js'
import { createRunHistory } from './run-history.svelte.js'

vi.mock('./client-request.js', () => ({
	request: vi.fn<(url: string, body: Record<string, unknown>, method?: string) => Promise<unknown>>(
		async () => {
			await Promise.resolve()
			return {}
		},
	),
}))

const requestMock = vi.mocked(request)

function run(id: string, number: number): CommandRun {
	return { command: 'pwd', concurrency: 1, createdAt: '', finished: true, id, number, results: {} }
}

function calls() {
	return requestMock.mock.calls.map(([url, , method]) => `${method} ${url}`)
}

beforeEach(() => {
	requestMock.mockClear()
})

describe('run history', () => {
	it('keeps a cleared run that a rule filters by, stopping it instead of deleting it', async () => {
		const history = createRunHistory((runId) => runId === 'kept')
		const runs = [run('kept', 1), run('dropped', 2)]
		await history.clear('kept', runs)
		await history.clear('dropped', runs)
		expect(history.cleared.map((entry) => entry.id)).toEqual(['kept'])
		expect(calls()).toEqual(['PATCH /api/runs/kept', 'DELETE /api/runs/dropped'])
	})

	it('deletes a run it does not know about', async () => {
		const history = createRunHistory(() => true)
		await history.clear('missing', [])
		expect(history.cleared).toEqual([])
		expect(calls()).toEqual(['DELETE /api/runs/missing'])
	})

	it('deletes cleared runs once no rule reads them', async () => {
		const filtered = new Set(['a', 'b'])
		const history = createRunHistory((runId) => filtered.has(runId))
		await history.clear('a', [run('a', 1)])
		await history.clear('b', [run('b', 2)])
		requestMock.mockClear()
		filtered.delete('a')
		await history.release()
		expect(history.cleared.map((entry) => entry.id)).toEqual(['b'])
		expect(calls()).toEqual(['DELETE /api/runs/a'])
		requestMock.mockClear()
		await history.release()
		expect(calls()).toEqual([])
	})

	it('counts up from 1 without reusing the numbers of cleared runs', async () => {
		const history = createRunHistory(() => false)
		expect(history.nextNumber).toBe(1)
		history.counted(run('a', 1))
		history.counted(run('b', 2))
		await history.clear('b', [run('b', 2)])
		expect(history.nextNumber).toBe(3)
		history.counted(run('old', 1))
		expect(history.nextNumber).toBe(3)
	})

	it('restores columns and cleared runs, numbering after the highest restored run', () => {
		const history = createRunHistory(() => true)
		const columns = history.restore([run('a', 4), run('b', 9), run('c', 2)], ['b'], 5)
		expect(columns.map((entry) => entry.id)).toEqual(['a', 'c'])
		expect(history.cleared.map((entry) => entry.id)).toEqual(['b'])
		expect(history.nextNumber).toBe(10)
		history.restore([], [], 7)
		expect(history.nextNumber).toBe(7)
	})

	it('starts numbering over after the runs still showing when the view resets', async () => {
		const history = createRunHistory(() => true)
		history.restore([run('a', 3), run('b', 8)], ['b'], 9)
		await history.reset([run('a', 3)])
		expect(history.cleared).toEqual([])
		expect(history.nextNumber).toBe(4)
		expect(calls()).toEqual(['DELETE /api/runs/b'])
		await history.reset([])
		expect(history.nextNumber).toBe(1)
	})
})
