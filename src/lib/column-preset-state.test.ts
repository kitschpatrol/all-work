import { describe, expect, it, vi } from 'vitest'
import type { ColumnPreset } from './column-presets.js'
import { createColumnPresets } from './column-preset-state.svelte.js'
import { defaultColumnPreset } from './column-presets.js'

const available = [...defaultColumnPreset.columns, 'remote', 'packageManager']
const customId = /^custom:/v

function setup(savedPresets: ColumnPreset[] = []) {
	// Command run columns sit alongside repository columns and are never part of a preset
	let visibility: Record<string, boolean> = {
		...Object.fromEntries(available.map((id) => [id, defaultColumnPreset.columns.includes(id)])),
		'run-1': true,
	}
	const apply = vi.fn<(changes: Record<string, boolean>) => void>((changes) => {
		visibility = { ...visibility, ...changes }
	})
	const onPresetsChange = vi.fn<(presets: ColumnPreset[]) => Promise<void>>(async (presets) => {
		await Promise.resolve()
		savedPresets.splice(0, savedPresets.length, ...presets)
	})
	const state = createColumnPresets({
		apply,
		available: () => available,
		onPresetsChange,
		presets: () => savedPresets,
		visibility: () => visibility,
	})
	function toggle(column: string) {
		state.edit()
		visibility = { ...visibility, [column]: visibility[column] === false }
	}

	return {
		apply,
		onPresetsChange,
		savedPresets,
		state,
		toggle,
		visibility: () => visibility,
		visible: () =>
			Object.entries(visibility)
				.filter(([id, shown]) => shown && available.includes(id))
				.map(([id]) => id)
				.toSorted(),
	}
}

describe('column preset state', () => {
	it('selects a preset only when chosen and leaves a built-in once a column is changed by hand', () => {
		const { state, toggle } = setup()
		expect(state.selected).toBeUndefined()
		state.restore('defaults')
		expect(state.selected?.id).toBe('defaults')
		toggle('remote')
		expect(state.selected).toBeUndefined()
	})

	it('treats columns changed with nothing selected as a custom set', () => {
		const { state, toggle } = setup()
		state.restore()
		toggle('remote')
		state.restore()
		expect(state.selected).toBeUndefined()
	})

	it('saves the visible columns as a new preset and selects it', async () => {
		const { savedPresets, state, toggle } = setup()
		toggle('remote')
		toggle('description')
		await state.savePreset('  Remotes  ')
		expect(savedPresets).toEqual([
			{
				columns: available.filter(
					(column) => column !== 'description' && column !== 'packageManager',
				),
				id: expect.stringMatching(customId) as unknown,
				label: 'Remotes',
			},
		])
		expect(state.selected?.label).toBe('Remotes')
	})

	it('applies a preset and restores its columns by applying it again', async () => {
		const { apply, savedPresets, state, toggle, visible } = setup()
		toggle('remote')
		await state.savePreset('Remotes')
		const saved = visible()
		state.applyPreset('defaults')
		expect(visible()).toEqual(defaultColumnPreset.columns.toSorted())
		const id = savedPresets[0]?.id
		expect(id).toBeDefined()
		state.applyPreset(id!)
		toggle('version')
		expect(state.selected?.id).toBe(id)
		expect(state.modified).toBe(true)
		state.applyPreset(id!)
		expect(visible()).toEqual(saved)
		expect(state.modified).toBe(false)
		expect(apply).toHaveBeenCalledTimes(3)
	})

	it('renames a saved preset and refuses a name another preset uses', async () => {
		const { savedPresets, state, toggle } = setup()
		toggle('remote')
		await state.savePreset('First')
		toggle('version')
		await state.savePreset('Second')
		const id = savedPresets[1]?.id
		await expect(state.savePreset('FIRST', id)).rejects.toThrow('already exists')
		await state.savePreset('Renamed', id)
		expect(savedPresets.map((preset) => preset.label)).toEqual(['First', 'Renamed'])
		expect(state.selected?.id).toBe(id)
	})

	it('saves edits to a saved preset in place', async () => {
		const { savedPresets, state, toggle, visible } = setup()
		toggle('remote')
		await state.savePreset('Remotes')
		toggle('version')
		await state.savePreset('Remotes', savedPresets[0]?.id)
		expect(savedPresets).toHaveLength(1)
		expect(savedPresets[0]?.columns.toSorted()).toEqual(visible())
		expect(state.modified).toBe(false)
	})

	it('changes only repository columns when applying a preset', () => {
		const { apply, state, toggle, visibility } = setup()
		toggle('run-1')
		state.applyPreset('defaults')
		expect(Object.keys(apply.mock.calls[0]?.[0] ?? {})).toEqual(available)
		expect(visibility()['run-1']).toBe(false)
		expect(state.selected?.id).toBe('defaults')
	})

	it('starts a new set with only the repo name showing', () => {
		const { state, visible } = setup()
		state.newSet()
		expect(visible()).toEqual(['repoName'])
		expect(state.selected).toBeUndefined()
	})

	it('replaces a preset in place by ID or by a matching name', async () => {
		const other: ColumnPreset = { columns: ['name'], id: 'custom:other', label: 'Other' }
		const { savedPresets, state, toggle } = setup([other])
		await state.savePreset('Mine')
		const id = state.selected?.id
		toggle('remote')
		await state.savePreset('Mine', id)
		expect(savedPresets.map((preset) => preset.label)).toEqual(['Other', 'Mine'])
		expect(savedPresets[1]?.columns).toContain('remote')
		state.applyPreset('custom:other')
		toggle('branch')
		await state.savePreset('MINE')
		expect(savedPresets.map((preset) => preset.label)).toEqual(['Other', 'MINE'])
		expect(savedPresets[1]?.id).toBe(id)
		expect(savedPresets[1]?.columns).toEqual(['name', 'branch'])
	})

	it('refuses to change built-ins, blank names, or a 101st preset', async () => {
		const full = Array.from({ length: 100 }, (_, index) => ({
			columns: ['name'],
			id: `custom:${index}` as const,
			label: `Preset ${index}`,
		}))
		const { onPresetsChange, state } = setup(full)
		await expect(state.savePreset('default')).rejects.toThrow('Built-in presets')
		await expect(state.savePreset('All')).rejects.toThrow('Built-in presets')
		await expect(state.savePreset(' '.repeat(3))).rejects.toThrow('between 1 and 80')
		await expect(state.savePreset('One more')).rejects.toThrow('up to 100')
		await state.savePreset('Preset 0')
		expect(onPresetsChange).toHaveBeenCalledOnce()
	})

	it('deletes only saved presets and keeps the visible columns', async () => {
		const { savedPresets, state, toggle, visible } = setup()
		toggle('remote')
		await state.savePreset('Remotes')
		const before = visible()
		await state.deletePreset()
		expect(savedPresets).toEqual([])
		expect(visible()).toEqual(before)
		expect(state.selected).toBeUndefined()
		state.applyPreset('all')
		await state.deletePreset()
		expect(state.presets).toHaveLength(15)
		expect(state.presets.every((preset) => !preset.id.startsWith('custom:'))).toBe(true)
	})

	it('shows every optional column with All and hides them with None, keeping command output', () => {
		const { state, visibility, visible } = setup()
		state.applyPreset('all')
		expect(visible()).toEqual(available.toSorted())
		expect(state.selected?.id).toBe('all')
		state.applyPreset('none')
		expect(visible()).toEqual([])
		expect(state.selected?.id).toBe('none')
		expect(visibility()['run-1']).toBe(true)
	})

	it('keeps the columns when saving fails', async () => {
		const { onPresetsChange, state, toggle, visible } = setup()
		toggle('remote')
		const columns = visible()
		onPresetsChange.mockRejectedValueOnce(new Error('Disk unavailable'))
		await expect(state.savePreset('Remotes')).rejects.toThrow('Disk unavailable')
		expect(state.selected).toBeUndefined()
		expect(visible()).toEqual(columns)
	})

	it('shows a custom set when the selected preset no longer exists', () => {
		const { state } = setup()
		state.restore('custom:gone')
		expect(state.selected).toBeUndefined()
	})
})
