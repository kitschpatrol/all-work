import { describe, expect, it, vi } from 'vitest'
import type { FilterPreset } from './filter-presets.js'
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

function setup(runs: CommandRun[] = [], savedPresets: FilterPreset[] = []) {
	const onChange = vi.fn<() => void>()
	const onPresetsChange = vi.fn<(presets: FilterPreset[]) => Promise<void>>(async (presets) => {
		await Promise.resolve()
		savedPresets.splice(0, savedPresets.length, ...presets)
	})
	const rows = [repository('dirty', 2), repository('clean', 0)]
	const state = createRowFilter({
		onChange,
		onPresetsChange,
		presets: () => savedPresets,
		repositories: () => rows,
		runs: () => runs,
	})
	return { onChange, onPresetsChange, rows, savedPresets, state }
}

describe('row filter state', () => {
	it('expands and collapses the editor without changing the filter', () => {
		const { onChange, state } = setup()
		expect(state.shown).toBe(false)
		state.toggle()
		expect(state.shown).toBe(true)
		expect(state.filter.rules).toHaveLength(0)
		expect(state.activeRules).toBe(0)
		expect(onChange).not.toHaveBeenCalled()
		state.toggle()
		expect(state.shown).toBe(false)
		expect(state.open).toBe(false)
	})

	it('keeps the editor open once its last rule is removed', () => {
		const { state } = setup()
		state.toggle()
		state.set(emptyFilter())
		expect(state.open).toBe(true)
		expect(state.shown).toBe(true)
	})

	it('starts a new draft independently of the selected preset', () => {
		const { state } = setup()
		state.applyPreset('changed')
		state.newFilter()
		expect(state.shown).toBe(true)
		expect(state.filter.rules).toEqual([{ column: 'name', operator: 'contains', value: '' }])
		expect(state.selectedPreset).toBeUndefined()
		expect(state.activeRules).toBe(0)
	})

	it('appends a column rule and opens the editor without replacing existing groups', () => {
		const { onChange, state } = setup()
		state.restore(
			{
				match: 'any',
				rules: [
					{
						match: 'none',
						rules: [{ column: 'changedFiles', operator: 'is', value: '0' }],
					},
				],
			},
			false,
		)
		const existing = state.filter
		state.addColumnRule('branch')
		expect(state.shown).toBe(true)
		expect(state.filter.match).toBe('any')
		expect(state.filter.rules).toEqual([
			...existing.rules,
			{ column: 'branch', operator: 'contains', value: '' },
		])
		expect(onChange).toHaveBeenCalledOnce()
	})

	it.each([
		{ column: 'changedFiles', operator: 'is', value: '' },
		{ column: 'lastCommitDate', operator: 'inLast', value: '' },
		{ column: 'metadata:Public', operator: 'isYes', value: '' },
		{ column: 'metadata:Tags', operator: 'includes', value: '' },
		{ column: 'run-1', operator: 'statusIs', value: 'failed' },
	])('starts a rule with the appropriate controls for $column', (rule) => {
		const { state } = setup([
			{ command: 'pwd', concurrency: 1, createdAt: '', finished: true, id: 'run-1', results: {} },
		])
		state.addColumnRule(rule.column)
		expect(state.shown).toBe(true)
		expect(state.filter.rules).toEqual([rule])
	})

	it('ignores columns that no longer exist', () => {
		const { onChange, state } = setup()
		state.addColumnRule('removed-run')
		expect(state.filter).toEqual(emptyFilter())
		expect(state.open).toBe(false)
		expect(onChange).not.toHaveBeenCalled()
	})

	it('applies presets without expanding and clears one when chosen again in the menu', () => {
		const { rows, state } = setup()
		state.togglePreset('changed')
		expect(state.preset).toBe('changed')
		expect(state.shown).toBe(false)
		expect(rows.filter((row) => state.matches(row)).map((row) => row.id)).toEqual(['dirty'])
		state.togglePreset('clean')
		expect(rows.filter((row) => state.matches(row)).map((row) => row.id)).toEqual(['clean'])
		state.togglePreset('clean')
		expect(state.preset).toBeUndefined()
		expect(rows.every((row) => state.matches(row))).toBe(true)
	})

	it('keeps filtering when the editor is collapsed and cleared while expanded', () => {
		const { rows, state } = setup()
		state.applyPreset('changed')
		state.expand()
		state.toggle()
		expect(state.shown).toBe(false)
		expect(rows.filter((row) => state.matches(row)).map((row) => row.id)).toEqual(['dirty'])
		state.expand()
		state.clear()
		expect(state.shown).toBe(true)
		expect(state.selectedPreset).toBeUndefined()
		expect(rows.every((row) => state.matches(row))).toBe(true)
	})

	it('retains the preset being edited and can revert to its saved conditions', () => {
		const { state } = setup()
		state.applyPreset('changed')
		state.set({ match: 'all', rules: [{ column: 'branch', operator: 'is', value: 'main' }] })
		expect(state.preset).toBeUndefined()
		expect(state.selectedPreset?.id).toBe('changed')
		expect(state.modified).toBe(true)
		state.applyPreset('changed')
		expect(state.modified).toBe(false)
		expect(state.filter.rules[0]).toEqual({
			column: 'changedFiles',
			operator: 'greaterThan',
			value: '0',
		})
	})

	it('saves a new preset without replacing the edited preset', async () => {
		const { onPresetsChange, savedPresets, state } = setup()
		state.applyPreset('changed')
		state.set({ match: 'all', rules: [{ column: 'branch', operator: 'is', value: 'main' }] })
		await state.savePreset('  Main branch  ')
		expect(onPresetsChange).toHaveBeenCalledOnce()
		expect(savedPresets).toEqual([
			{
				filter: state.filter,
				id: expect.any(String) as unknown,
				label: 'Main branch',
			},
		])
		expect(state.selectedPreset?.label).toBe('Main branch')
		expect(state.selectedPreset?.id.startsWith('custom:')).toBe(true)
		expect(state.modified).toBe(false)
		state.applyPreset('changed')
		expect(state.filter.rules[0]).toEqual({
			column: 'changedFiles',
			operator: 'greaterThan',
			value: '0',
		})
	})

	it('updates a preset in place and restores a built-in default', async () => {
		const { savedPresets, state } = setup()
		state.applyPreset('changed')
		state.set({
			match: 'all',
			rules: [{ column: 'changedFiles', operator: 'atLeast', value: '5' }],
		})
		await state.savePreset('With Changes', 'changed')
		expect(savedPresets).toHaveLength(1)
		expect(state.selectedPreset?.id).toBe('changed')
		expect(state.modified).toBe(false)
		expect(state.storedPreset).toBe(true)
		state.clear()
		state.applyPreset('changed')
		expect(state.filter.rules[0]).toEqual({
			column: 'changedFiles',
			operator: 'atLeast',
			value: '5',
		})
		await state.deletePreset()
		expect(savedPresets).toHaveLength(0)
		expect(state.filter.rules[0]).toEqual({
			column: 'changedFiles',
			operator: 'greaterThan',
			value: '0',
		})
		expect(state.modified).toBe(false)
	})

	it('updates a matching name and keeps the conditions when deleting a custom preset', async () => {
		const { savedPresets, state } = setup()
		state.applyPreset('clean')
		await state.savePreset('My filter')
		const id = savedPresets[0]?.id
		state.set({ match: 'all', rules: [{ column: 'branch', operator: 'is', value: 'main' }] })
		await state.savePreset('MY FILTER')
		expect(savedPresets).toHaveLength(1)
		expect(savedPresets[0]?.id).toBe(id)
		const { filter } = state
		await state.deletePreset()
		expect(savedPresets).toHaveLength(0)
		expect(state.filter).toEqual(filter)
		expect(state.selectedPreset).toBeUndefined()
	})

	it('keeps the draft and preset identity when saving fails', async () => {
		const { onPresetsChange, state } = setup()
		state.applyPreset('changed')
		state.set({ match: 'all', rules: [{ column: 'branch', operator: 'is', value: 'main' }] })
		onPresetsChange.mockRejectedValueOnce(new Error('Disk unavailable'))
		await expect(state.savePreset('Unsaved copy')).rejects.toThrow('Disk unavailable')
		expect(state.selectedPreset?.id).toBe('changed')
		expect(state.modified).toBe(true)
		expect(state.filter.rules[0]).toEqual({ column: 'branch', operator: 'is', value: 'main' })
	})

	it('keeps existing presets when the saved preset limit is reached', async () => {
		const saved: FilterPreset[] = Array.from({ length: 100 }, (_, index) => ({
			filter: {
				match: 'all',
				rules: [{ column: 'branch', operator: 'is', value: `branch-${index}` }],
			},
			id: `custom:${index}`,
			label: `Branch ${index}`,
		}))
		const { onPresetsChange, state } = setup([], saved)
		state.applyPreset('clean')
		await expect(state.savePreset('One more')).rejects.toThrow('up to 100')
		expect(onPresetsChange).not.toHaveBeenCalled()
		await state.savePreset('Branch 0')
		expect(onPresetsChange).toHaveBeenCalledOnce()
		expect(saved).toHaveLength(100)
	})

	it('restores the source of an edited preset even when its conditions differ', () => {
		const { onChange, state } = setup()
		state.restore(
			{ match: 'all', rules: [{ column: 'branch', operator: 'is', value: 'main' }] },
			false,
			'changed',
		)
		expect(state.selectedPreset?.id).toBe('changed')
		expect(state.modified).toBe(true)
		expect(state.shown).toBe(false)
		expect(onChange).not.toHaveBeenCalled()
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
