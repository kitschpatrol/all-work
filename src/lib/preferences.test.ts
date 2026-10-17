import { describe, expect, it } from 'vitest'
import {
	defaultPreferences,
	parseIdentity,
	parseIdentityNames,
	parsePreferences,
} from './preferences.js'

describe('saved project identity', () => {
	it('hides repository shortcuts unless they were explicitly enabled', () => {
		expect(defaultPreferences().showRepositoryShortcuts).toBe(false)
		expect(parsePreferences({}).showRepositoryShortcuts).toBe(false)
		expect(parsePreferences({ showRepositoryShortcuts: 'true' }).showRepositoryShortcuts).toBe(
			false,
		)
		expect(parsePreferences({ showRepositoryShortcuts: true }).showRepositoryShortcuts).toBe(true)
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
