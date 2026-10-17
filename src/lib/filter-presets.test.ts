import { describe, expect, it } from 'vitest'
import type { FilterPreset } from './filter-presets.js'
import {
	filterPresets,
	findFilterPreset,
	getPresetFilter,
	isFilterPresetId,
	parseFilterPresets,
	resolveFilterPresets,
} from './filter-presets.js'

describe('saved filter presets', () => {
	it('keeps built-in presets while applying saved overrides and custom presets', () => {
		const saved: FilterPreset[] = [
			{
				filter: { match: 'all', rules: [{ column: 'branch', operator: 'is', value: 'main' }] },
				id: 'changed',
				label: 'With Changes',
			},
			{ filter: getPresetFilter('clean'), id: 'custom:fixture', label: 'My filter' },
		]
		const resolved = resolveFilterPresets(saved)
		expect(resolved.map((preset) => preset.id)).toEqual(['changed', 'clean', 'custom:fixture'])
		expect(getPresetFilter('changed', resolved)).toEqual(saved[0]?.filter)
		expect(getPresetFilter('changed')).toEqual(filterPresets[0]?.filter)
	})

	it('copies filters so edits cannot change a saved preset', () => {
		const original = getPresetFilter('changed')
		const copy = getPresetFilter('changed')
		copy.rules.shift()
		expect(getPresetFilter('changed')).toEqual(original)
		expect(findFilterPreset(original)).toBe('changed')
		expect(findFilterPreset(copy)).toBeUndefined()
	})

	it('normalizes persisted filters, trims names, and keeps the latest duplicate ID', () => {
		const saved = parseFilterPresets([
			{ filter: {}, id: 'custom:fixture', label: 'Previous' },
			{
				filter: {
					match: 'all',
					rules: [undefined, { column: 'branch', operator: 'is', value: 'main' }],
				},
				id: 'custom:fixture',
				label: '  Main branch  ',
			},
		])
		expect(saved).toEqual([
			{
				filter: { match: 'all', rules: [{ column: 'branch', operator: 'is', value: 'main' }] },
				id: 'custom:fixture',
				label: 'Main branch',
			},
		])
	})

	it('ignores damaged entries and rejects oversized IDs and names', () => {
		expect(parseFilterPresets('broken')).toEqual([])
		expect(
			parseFilterPresets([
				undefined,
				{ filter: {}, id: 'unknown', label: 'Invalid ID' },
				{ filter: {}, id: 'changed', label: ' ' },
				{ filter: {}, id: 'changed', label: 'a'.repeat(81) },
				{ filter: 'broken', id: 'clean', label: 'Missing filter' },
			]),
		).toEqual([])
		expect(isFilterPresetId('custom:')).toBe(false)
		expect(isFilterPresetId(`custom:${'a'.repeat(100)}`)).toBe(false)
		expect(isFilterPresetId('custom:fixture')).toBe(true)
	})

	it('serializes reactive filter data into plain objects', () => {
		const filter = new Proxy(getPresetFilter('changed'), {})
		const saved = parseFilterPresets([{ filter, id: 'custom:fixture', label: 'Fixture' }])
		expect(() => structuredClone(saved)).not.toThrow()
		expect(saved[0]?.filter).toEqual(getPresetFilter('changed'))
	})
})
