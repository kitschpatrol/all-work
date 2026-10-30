import { describe, expect, it } from 'vitest'
import type { ColumnPreset } from './column-presets.js'
import {
	allColumnPreset,
	defaultColumnPreset,
	isBasicColumnPreset,
	isColumnPresetId,
	matchesColumns,
	parseColumnPresets,
	resolveColumnPresets,
} from './column-presets.js'

const available = ['name', 'description', 'branch', 'version']
const review: ColumnPreset = { columns: ['name', 'version'], id: 'custom:review', label: 'Review' }

describe('column presets', () => {
	it('keeps Default, All, and None first, sorts the rest, and ignores saved replacements of built-ins', () => {
		const resolved = resolveColumnPresets(
			[{ columns: [], id: 'defaults', label: 'Defaults' }, review],
			['name', 'version'],
		)
		expect(resolved.map((preset) => preset.label)).toEqual([
			'Default',
			'All',
			'None',
			'Adoption',
			'CI Triage',
			'Codebase Size',
			'Dependencies',
			'Fork Sync',
			'Git Work',
			'GitHub',
			'Maintenance',
			'Ownership',
			'Platform',
			'Project Catalog',
			'Publishing',
			'Review',
		])
		expect(resolved).toContainEqual(defaultColumnPreset)
		expect(resolved).toContainEqual(allColumnPreset(['name', 'version']))
		expect(resolved).toContainEqual(review)
		expect(
			resolved.filter((preset) => isBasicColumnPreset(preset.id)).map((preset) => preset.label),
		).toEqual(['Default', 'All', 'None'])
		expect(allColumnPreset(['name', 'version']).columns).toEqual(['name', 'version'])
	})

	it('matches the visible set exactly, ignoring columns that no longer exist', () => {
		const stale: ColumnPreset = { ...review, columns: ['name', 'version', 'removed-column'] }
		expect(matchesColumns(stale, new Set(['name', 'version']), available)).toBe(true)
		expect(matchesColumns(review, new Set(['name']), available)).toBe(false)
		expect(matchesColumns(review, new Set(['branch', 'name', 'version']), available)).toBe(false)
		// Columns outside the available set, such as command runs, never affect the match
		expect(matchesColumns(review, new Set(['name', 'run-1', 'version']), available)).toBe(true)
	})

	it('trims names, drops duplicate and blank columns, and keeps the latest duplicate ID', () => {
		expect(
			parseColumnPresets([
				{ columns: ['name'], id: 'custom:review', label: 'Previous' },
				{ columns: ['name', 'name', '', 3, 'version'], id: 'custom:review', label: '  Review  ' },
			]),
		).toEqual([review])
	})

	it('ignores damaged entries, saved copies of built-ins, and oversized IDs and names', () => {
		expect(parseColumnPresets('broken')).toEqual([])
		expect(
			parseColumnPresets([
				undefined,
				{ columns: [], id: 'defaults', label: 'Defaults' },
				{ columns: [], id: 'all', label: 'All' },
				{ columns: [], id: 'unknown', label: 'Invalid ID' },
				{ columns: [], id: 'custom:blank', label: ' ' },
				{ columns: [], id: 'custom:long', label: 'a'.repeat(81) },
				{ columns: 'name', id: 'custom:broken', label: 'Broken columns' },
			]),
		).toEqual([])
		expect(isColumnPresetId('defaults')).toBe(true)
		expect(isColumnPresetId('all')).toBe(true)
		expect(isColumnPresetId('custom:')).toBe(false)
		expect(isColumnPresetId(`custom:${'a'.repeat(100)}`)).toBe(false)
	})

	it('copies reactive column lists into plain arrays', () => {
		const saved = parseColumnPresets([{ ...review, columns: new Proxy(['name'], {}) }])
		expect(() => structuredClone(saved)).not.toThrow()
	})
})
