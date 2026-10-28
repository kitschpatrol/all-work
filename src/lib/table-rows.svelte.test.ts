import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repository } from './workspace.js'
import { createTableRows } from './table-rows.svelte.js'

function repository(id: string, changedFiles: number): Repository {
	return {
		ahead: 0,
		behind: 0,
		branch: 'main',
		changedFiles,
		description: '',
		gitStatusAvailable: true,
		id,
		lastCommit: '',
		lastCommitDate: '',
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
	}
}

const cleanups: Array<() => void> = []

function setup() {
	const state = $state({
		filtering: true,
		minimum: 1,
		reads: true,
		repositories: [repository('a', 2), repository('b', 0), repository('c', 1)],
		selection: undefined as Record<string, boolean> | undefined,
	})
	const tableRows = createTableRows({
		matches() {
			const { filtering, minimum } = state
			return (row) => !filtering || row.changedFiles >= minimum
		},
		readsValues: () => state.reads,
		repositories: () => state.repositories,
		selection: () => state.selection,
	})
	// Like the table, read the rows from an effect, which keeps them memoized
	let shown: string[] = []
	const stop = $effect.root(() => {
		$effect(() => {
			shown = tableRows.rows.map((row) => row.id)
		})
	})
	cleanups.push(stop)
	flushSync()
	// Updates arrive in separate tasks, with Svelte flushing between them
	const ids = () => {
		flushSync()
		return shown
	}

	return { ids, state, tableRows }
}

describe('table rows', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		for (const cleanup of cleanups.splice(0)) {
			cleanup()
		}

		vi.useRealTimers()
	})

	it('updates right away when the rules, selection, or repositories change', () => {
		const { ids, state } = setup()
		expect(ids()).toEqual(['a', 'c'])
		state.minimum = 2
		expect(ids()).toEqual(['a'])
		state.filtering = false
		state.selection = { b: true, c: true }
		expect(ids()).toEqual(['b', 'c'])
		state.repositories = [repository('d', 0)]
		state.selection = undefined
		expect(ids()).toEqual(['d'])
	})

	it('keeps rows until told that values changed in place', () => {
		const { ids, state, tableRows } = setup()
		expect(ids()).toEqual(['a', 'c'])
		state.repositories[1]!.changedFiles = 3
		expect(ids()).toEqual(['a', 'c'])
		tableRows.changed()
		expect(ids()).toEqual(['a', 'b', 'c'])
	})

	it('reads values again at most once a second', () => {
		const { ids, state, tableRows } = setup()
		tableRows.changed()
		expect(ids()).toEqual(['a', 'c'])
		state.repositories[1]!.changedFiles = 3
		tableRows.changed()
		expect(ids()).toEqual(['a', 'c'])
		vi.advanceTimersByTime(400)
		state.repositories[2]!.changedFiles = 0
		tableRows.changed()
		expect(ids()).toEqual(['a', 'c'])
		vi.advanceTimersByTime(599)
		expect(ids()).toEqual(['a', 'c'])
		vi.advanceTimersByTime(1)
		expect(ids()).toEqual(['a', 'b'])
	})

	it('ignores value changes while nothing reads values', () => {
		const { ids, state, tableRows } = setup()
		state.reads = false
		state.repositories[1]!.changedFiles = 3
		tableRows.changed()
		vi.advanceTimersByTime(2000)
		expect(ids()).toEqual(['a', 'c'])
	})

	it('reads values right away on refresh, replacing a scheduled read', () => {
		const { ids, state, tableRows } = setup()
		tableRows.changed()
		expect(ids()).toEqual(['a', 'c'])
		state.repositories[1]!.changedFiles = 3
		tableRows.changed()
		tableRows.refresh()
		expect(ids()).toEqual(['a', 'b', 'c'])
		state.repositories[0]!.changedFiles = 0
		vi.advanceTimersByTime(2000)
		expect(ids()).toEqual(['a', 'b', 'c'])
	})

	it('drops a scheduled read when disposed', () => {
		const { ids, state, tableRows } = setup()
		tableRows.changed()
		expect(ids()).toEqual(['a', 'c'])
		state.repositories[1]!.changedFiles = 3
		tableRows.changed()
		tableRows.dispose()
		vi.advanceTimersByTime(2000)
		expect(ids()).toEqual(['a', 'c'])
	})
})
