import { describe, expect, it } from 'vitest'
import type { CommandRun, Repository } from './workspace.js'
import { getOutputNeighbors, outputWindowUrl } from './app-windows.js'

function row(id: string): Repository {
	return {
		id,
		name: `${id} name`,
		path: `/workspace/${id}`,
		relativePath: `${id} folder`,
	} as unknown as Repository
}

const run = {
	id: 'run',
	results: { a: { status: 'success' }, c: { status: 'queued' }, d: { status: 'failed' } },
} as unknown as CommandRun

// Display order, as sorted and filtered in the table; b was not part of the run
const rows = [row('d'), row('b'), row('a'), row('c')]

describe('getOutputNeighbors', () => {
	it('steps through rows with a result in display order, skipping rows outside the run', () => {
		expect(getOutputNeighbors(rows, run, 'a')).toEqual({
			next: {
				name: 'c name',
				path: '/workspace/c',
				relativePath: 'c folder',
				repositoryId: 'c',
				runId: 'run',
			},
			previous: {
				name: 'd name',
				path: '/workspace/d',
				relativePath: 'd folder',
				repositoryId: 'd',
				runId: 'run',
			},
		})
	})

	it('has nothing before the first result or after the last', () => {
		expect(getOutputNeighbors(rows, run, 'd').previous).toBeUndefined()
		expect(getOutputNeighbors(rows, run, 'c').next).toBeUndefined()
	})

	it('has no neighbors for a row hidden from the table, a row outside the run, or a missing run', () => {
		const none = { next: undefined, previous: undefined }
		expect(getOutputNeighbors([row('a'), row('c')], run, 'd')).toEqual(none)
		expect(getOutputNeighbors(rows, run, 'b')).toEqual(none)
		expect(getOutputNeighbors(rows, undefined, 'a')).toEqual(none)
	})
})

describe('outputWindowUrl', () => {
	it('keeps names and paths with spaces and symbols intact', () => {
		const target = {
			name: 'a & b',
			path: '/work space/a?b',
			relativePath: 'nested/a & b',
			repositoryId: 'x/y',
			runId: 'run 1',
		}
		const url = new URL(outputWindowUrl(target), 'http://localhost')
		expect(url.pathname).toBe('/output')
		expect(Object.fromEntries(url.searchParams)).toEqual({
			name: 'a & b',
			path: '/work space/a?b',
			relativePath: 'nested/a & b',
			repository: 'x/y',
			run: 'run 1',
		})
	})
})
