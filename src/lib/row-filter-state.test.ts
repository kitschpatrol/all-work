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

function setup(
	runs: CommandRun[] = [],
	savedPresets: FilterPreset[] = [],
	clearedRuns: CommandRun[] = [],
) {
	const onChange = vi.fn<() => void>()
	const onPresetsChange = vi.fn<(presets: FilterPreset[]) => Promise<void>>(async (presets) => {
		await Promise.resolve()
		savedPresets.splice(0, savedPresets.length, ...presets)
	})
	const rows = [repository('dirty', 2), repository('clean', 0)]
	const state = createRowFilter({
		clearedRuns: () => clearedRuns,
		onChange,
		onPresetsChange,
		presets: () => savedPresets,
		runs: () => runs,
	})
	return { onChange, onPresetsChange, rows, savedPresets, state }
}

describe('row filter state', () => {
	it('opens and closes the popover without changing the filter', () => {
		const { onChange, state } = setup()
		expect(state.open).toBe(false)
		state.open = true
		expect(state.open).toBe(true)
		expect(state.filter.rules).toHaveLength(0)
		expect(state.activeRules).toBe(0)
		expect(onChange).not.toHaveBeenCalled()
		state.open = false
		expect(state.open).toBe(false)
	})

	it('keeps the popover open once its last rule is removed', () => {
		const { state } = setup()
		state.open = true
		state.set(emptyFilter())
		expect(state.open).toBe(true)
	})

	it('starts a new draft independently of the selected preset', () => {
		const { state } = setup()
		state.applyPreset('changed')
		state.newFilter()
		expect(state.open).toBe(true)
		expect(state.filter.rules).toEqual([{ column: 'name', operator: 'contains', value: '' }])
		expect(state.selectedPreset).toBeUndefined()
		expect(state.activeRules).toBe(0)
	})

	it('appends a column rule and opens the popover without replacing existing groups', () => {
		const { onChange, state } = setup()
		state.restore({
			match: 'any',
			rules: [
				{
					match: 'none',
					rules: [{ column: 'changedFiles', operator: 'is', value: '0' }],
				},
			],
		})
		const existing = state.filter
		state.addColumnRule('branch')
		expect(state.open).toBe(true)
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
			{
				command: 'pwd',
				concurrency: 1,
				createdAt: '',
				finished: true,
				id: 'run-1',
				number: 1,
				results: {},
			},
		])
		state.addColumnRule(rule.column)
		expect(state.open).toBe(true)
		expect(state.filter.rules).toEqual([rule])
	})

	it("keeps filtering by a cleared run's output and lists it with the cleared runs", () => {
		const cleared: CommandRun = {
			command: 'git pull',
			concurrency: 1,
			createdAt: '',
			finished: true,
			id: 'run-3',
			number: 3,
			results: {
				clean: { output: '', repositoryId: 'clean', status: 'success', truncated: false },
				dirty: { output: 'conflict', repositoryId: 'dirty', status: 'failed', truncated: false },
			},
		}
		const { rows, state } = setup([], [], [cleared])
		state.set({ match: 'all', rules: [{ column: 'run-3', operator: 'statusIs', value: 'failed' }] })
		state.prune()
		expect(state.filter.rules).toHaveLength(1)
		expect(rows.map((row) => state.matches(row))).toEqual([true, false])
		expect(state.references('run-3')).toBe(true)
		expect(state.references('run-4')).toBe(false)
		expect(state.columns.at(-1)).toEqual({
			category: 'Cleared runs',
			header: 'Run 3: git pull',
			id: 'run-3',
			kind: 'output',
		})
	})

	it('lists a run that is both a column and being cleared only once', () => {
		const run: CommandRun = {
			command: 'pwd',
			concurrency: 1,
			createdAt: '',
			finished: true,
			id: 'run-1',
			number: 1,
			results: {},
		}
		const { state } = setup([run], [], [run])
		expect(state.columns.filter((column) => column.id === 'run-1')).toEqual([
			{ category: 'Runs', header: 'Run 1: pwd', id: 'run-1', kind: 'output' },
		])
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
		expect(state.selectedPreset?.id).toBe('changed')
		expect(state.open).toBe(false)
		expect(rows.filter((row) => state.matches(row)).map((row) => row.id)).toEqual(['dirty'])
		state.togglePreset('clean')
		expect(rows.filter((row) => state.matches(row)).map((row) => row.id)).toEqual(['clean'])
		state.togglePreset('clean')
		expect(state.selectedPreset).toBeUndefined()
		expect(rows.every((row) => state.matches(row))).toBe(true)
	})

	it('keeps filtering while the popover is closed and clears while it is open', () => {
		const { rows, state } = setup()
		state.applyPreset('changed')
		expect(state.open).toBe(false)
		expect(rows.filter((row) => state.matches(row)).map((row) => row.id)).toEqual(['dirty'])
		state.open = true
		state.clear()
		expect(state.open).toBe(true)
		expect(state.selectedPreset).toBeUndefined()
		expect(rows.every((row) => state.matches(row))).toBe(true)
	})

	it('keeps a saved preset selected while editing it and reverts by applying it again', async () => {
		const { savedPresets, state } = setup()
		state.applyPreset('clean')
		await state.savePreset('Spotless')
		const id = savedPresets[0]?.id
		state.set({ match: 'all', rules: [{ column: 'branch', operator: 'is', value: 'main' }] })
		expect(state.selectedPreset?.id).toBe(id)
		expect(state.modified).toBe(true)
		await state.savePreset('Spotless', id)
		expect(savedPresets).toHaveLength(1)
		expect(state.modified).toBe(false)
		state.set({ match: 'any', rules: [{ column: 'branch', operator: 'is', value: 'dev' }] })
		state.applyPreset(id!)
		expect(state.modified).toBe(false)
		expect(state.filter.rules[0]).toEqual({ column: 'branch', operator: 'is', value: 'main' })
	})

	it('makes the filter custom when a built-in preset is edited and restores it when applied again', () => {
		const { state } = setup()
		state.applyPreset('changed')
		state.set({ match: 'all', rules: [{ column: 'branch', operator: 'is', value: 'main' }] })
		expect(state.selectedPreset).toBeUndefined()
		state.applyPreset('changed')
		expect(state.selectedPreset?.id).toBe('changed')
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
		state.applyPreset('changed')
		expect(state.filter.rules[0]).toEqual({
			column: 'changedFiles',
			operator: 'greaterThan',
			value: '0',
		})
	})

	it('renames a saved preset by id and refuses a name another preset uses', async () => {
		const { savedPresets, state } = setup()
		state.applyPreset('clean')
		await state.savePreset('First')
		state.applyPreset('changed')
		await state.savePreset('Second')
		const id = savedPresets[1]?.id
		await expect(state.savePreset('first', id)).rejects.toThrow('already exists')
		await state.savePreset('Renamed', id)
		expect(savedPresets.map((preset) => preset.label)).toEqual(['First', 'Renamed'])
		expect(state.selectedPreset?.id).toBe(id)
	})

	it('keeps built-in presets read-only', async () => {
		const { savedPresets, state } = setup()
		state.applyPreset('changed')
		state.set({
			match: 'all',
			rules: [{ column: 'changedFiles', operator: 'atLeast', value: '5' }],
		})
		await expect(state.savePreset('with changes')).rejects.toThrow('Built-in presets')
		await expect(state.savePreset('Mine', 'changed')).rejects.toThrow('Built-in presets')
		await state.deletePreset()
		expect(savedPresets).toHaveLength(0)
		expect(state.selectedPreset).toBeUndefined()
		expect(state.filter.rules[0]).toEqual({
			column: 'changedFiles',
			operator: 'atLeast',
			value: '5',
		})
	})

	it('updates a matching name and keeps the rules when deleting a custom preset', async () => {
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

	it('keeps the draft when saving fails', async () => {
		const { onPresetsChange, state } = setup()
		state.applyPreset('changed')
		state.set({ match: 'all', rules: [{ column: 'branch', operator: 'is', value: 'main' }] })
		onPresetsChange.mockRejectedValueOnce(new Error('Disk unavailable'))
		await expect(state.savePreset('Unsaved copy')).rejects.toThrow('Disk unavailable')
		expect(state.selectedPreset).toBeUndefined()
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

	it('ignores a restored built-in whose rules no longer match but keeps an edited saved preset', async () => {
		const { onChange, savedPresets, state } = setup()
		state.restore(
			{ match: 'all', rules: [{ column: 'branch', operator: 'is', value: 'main' }] },
			'changed',
		)
		expect(state.selectedPreset).toBeUndefined()
		expect(onChange).not.toHaveBeenCalled()
		await state.savePreset('Mine')
		state.restore(
			{ match: 'all', rules: [{ column: 'branch', operator: 'is', value: 'dev' }] },
			savedPresets[0]?.id,
		)
		expect(state.selectedPreset?.label).toBe('Mine')
		expect(state.modified).toBe(true)
	})

	it('restores saved rules without reporting a change', () => {
		const { onChange, state } = setup()
		state.restore(
			{ match: 'all', rules: [{ column: 'changedFiles', operator: 'is', value: '0' }] },
			'clean',
		)
		expect(onChange).not.toHaveBeenCalled()
		expect(state.selectedPreset?.id).toBe('clean')
		expect(state.open).toBe(false)
	})

	it('drops rules on runs that are gone', () => {
		const runs: CommandRun[] = [
			{
				command: 'pwd',
				concurrency: 1,
				createdAt: '',
				finished: true,
				id: 'run-1',
				number: 1,
				results: {},
			},
		]
		const { state } = setup(runs)
		state.restore({
			match: 'all',
			rules: [
				{ column: 'run-1', operator: 'statusIs', value: 'notIncluded' },
				{ column: 'branch', operator: 'is', value: 'main' },
			],
		})
		expect(state.activeRules).toBe(2)
		runs.length = 0
		state.prune()
		expect(state.filter.rules).toEqual([{ column: 'branch', operator: 'is', value: 'main' }])
	})

	it('hides rows waiting on metadata a rule reads', () => {
		const { rows, state } = setup()
		state.restore({
			match: 'all',
			rules: [{ column: 'metadata:Stars', operator: 'atLeast', value: '1' }],
		})
		expect(state.groups).toEqual(['github'])
		expect(rows.some((row) => state.matches(row))).toBe(false)
	})
})
