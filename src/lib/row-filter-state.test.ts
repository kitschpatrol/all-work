import { describe, expect, it, vi } from 'vitest'
import type { CommandRun, Repository } from './workspace.js'
import { createRowFilter } from './row-filter-state.svelte.js'
import { emptyFilter } from './row-filter.js'

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
		metadata: { groups: { git: { status: 'ready' }, local: { status: 'ready' } }, values: {} },
		name: id,
		packageManager: '',
		path: `/workspace/${id}`,
		relativePath: id,
		remote: '',
		repoName: id,
		repoOwner: '',
		version: '',
	}
}

function setup(runs: CommandRun[] = []) {
	const onChange = vi.fn<() => void>()
	const rows = [repository('dirty', 2), repository('clean', 0)]
	const state = createRowFilter({ onChange, repositories: () => rows, runs: () => runs })
	return { onChange, rows, state }
}

describe('row filter state', () => {
	it('starts a blank rule when first shown and hides when toggled again', () => {
		const { onChange, state } = setup()
		expect(state.shown).toBe(false)
		state.toggle()
		expect(state.shown).toBe(true)
		expect(state.filter.rules).toHaveLength(1)
		expect(state.activeRules).toBe(0)
		expect(onChange).toHaveBeenCalledOnce()
		state.toggle()
		expect(state.shown).toBe(false)
		expect(state.open).toBe(false)
	})

	it('hides the editor once its last rule is removed', () => {
		const { state } = setup()
		state.toggle()
		state.set(emptyFilter())
		expect(state.open).toBe(true)
		expect(state.shown).toBe(false)
	})

	it('applies a preset, recognizes it, and clears it when chosen again', () => {
		const { rows, state } = setup()
		state.togglePreset('changed')
		expect(state.preset).toBe('changed')
		expect(state.shown).toBe(true)
		expect(rows.filter((row) => state.matches(row)).map((row) => row.id)).toEqual(['dirty'])
		state.togglePreset('clean')
		expect(rows.filter((row) => state.matches(row)).map((row) => row.id)).toEqual(['clean'])
		state.togglePreset('clean')
		expect(state.preset).toBeUndefined()
		expect(rows.every((row) => state.matches(row))).toBe(true)
	})

	it('restores saved rules without reporting a change', () => {
		const { onChange, state } = setup()
		state.restore(
			{ match: 'all', rules: [{ column: 'changedFiles', operator: 'is', value: '0' }] },
			true,
		)
		expect(onChange).not.toHaveBeenCalled()
		expect(state.preset).toBe('clean')
		expect(state.shown).toBe(true)
	})

	it('drops rules on runs that are gone', () => {
		const runs: CommandRun[] = [
			{ command: 'pwd', concurrency: 1, createdAt: '', finished: true, id: 'run-1', results: {} },
		]
		const { state } = setup(runs)
		state.restore(
			{
				match: 'all',
				rules: [
					{ column: 'run-1', operator: 'statusIs', value: 'notIncluded' },
					{ column: 'branch', operator: 'is', value: 'main' },
				],
			},
			true,
		)
		expect(state.activeRules).toBe(2)
		runs.length = 0
		state.prune()
		expect(state.filter.rules).toEqual([{ column: 'branch', operator: 'is', value: 'main' }])
	})

	it('counts rows waiting on metadata a rule reads', () => {
		const { rows, state } = setup()
		state.restore(
			{ match: 'all', rules: [{ column: 'metadata:Stars', operator: 'atLeast', value: '1' }] },
			true,
		)
		expect(state.groups).toEqual(['github'])
		expect(state.undecided).toBe(rows.length)
		expect(rows.some((row) => state.matches(row))).toBe(false)
	})
})
