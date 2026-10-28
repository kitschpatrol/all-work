import { describe, expect, it } from 'vitest'
import { getPresetFilter } from './filter-presets.js'
import {
	defaultPreferences,
	parseIdentity,
	parseIdentityNames,
	parsePreferences,
} from './preferences.js'

describe('saved project identity', () => {
	it('keeps saved filter and column presets alongside appearance and identity preferences', () => {
		const filterPresets = [
			{ filter: getPresetFilter('clean'), id: 'custom:fixture', label: 'Fixture' },
		]
		const columnPresets = [{ columns: ['name'], id: 'custom:fixture', label: 'Fixture' }]
		expect(defaultPreferences().filterPresets).toEqual([])
		expect(defaultPreferences().columnPresets).toEqual([])
		expect(
			parsePreferences({ columnPresets, filterPresets, showRepositoryShortcuts: true }),
		).toMatchObject({
			columnPresets,
			filterPresets,
			showRepositoryShortcuts: true,
		})
	})

	it('hides repository shortcuts unless they were explicitly enabled', () => {
		expect(defaultPreferences().showRepositoryShortcuts).toBe(false)
		expect(parsePreferences({}).showRepositoryShortcuts).toBe(false)
		expect(parsePreferences({ showRepositoryShortcuts: 'true' }).showRepositoryShortcuts).toBe(
			false,
		)
		expect(parsePreferences({ showRepositoryShortcuts: true }).showRepositoryShortcuts).toBe(true)
	})

	it('keeps a saved readme app only when it is a bundle identifier', () => {
		expect(defaultPreferences().readmeApp).toBe('')
		expect(parsePreferences({ readmeApp: 'com.example.Editor-2' }).readmeApp).toBe(
			'com.example.Editor-2',
		)
		for (const readmeApp of ['-a Terminal', '../Editor.app', 'com example', 42, 'a'.repeat(256)]) {
			expect(parsePreferences({ readmeApp }).readmeApp).toBe('')
		}
	})

	it('keeps a saved terminal app only when it is a bundle identifier', () => {
		expect(defaultPreferences().terminalApp).toBe('')
		expect(parsePreferences({ terminalApp: 'com.mitchellh.ghostty' }).terminalApp).toBe(
			'com.mitchellh.ghostty',
		)
		for (const terminalApp of ['-a Terminal', '../Ghostty.app', 'com example', 42]) {
			expect(parsePreferences({ terminalApp }).terminalApp).toBe('')
		}
	})

	it('normalizes aliases without changing author casing', () => {
		expect(
			parseIdentity({
				authorNames: [' Test User ', 'Test User', ''],
				githubAccounts: ['@example', 'example', ' other '],
			}),
		).toEqual({ authorNames: ['Test User'], githubAccounts: ['example', 'other'] })
		expect(parseIdentityNames('Test User\nExample, Test User\n')).toEqual(['Test User', 'Example'])
	})

	it('rejects invalid or oversized identities and tolerates damaged preferences', () => {
		expect(parseIdentity({ authorNames: [42], githubAccounts: [] })).toBeUndefined()
		expect(parseIdentity({ authorNames: ['a'.repeat(201)], githubAccounts: [] })).toBeUndefined()
		expect(parsePreferences({ identity: 'broken' })).toEqual(defaultPreferences())
		expect(
			parsePreferences({
				identity: { authorNames: [], githubAccounts: [] },
				restoreWorkspace: false,
			}),
		).toMatchObject({ identity: { authorNames: [], githubAccounts: [] }, restoreWorkspace: false })
	})
})
