import { describe, expect, it, vi } from 'vitest'
import { getPresetFilter } from './filter-presets.js'
import { savePreferenceChanges, updatePreferences } from './preference-actions.js'
import { createRepositoryShortcuts, defaultPreferences } from './preferences.js'
import { savePreferences } from './view-storage.js'
import { postWindowMessage } from './window-messages.js'

vi.mock('./view-storage.js', () => ({
	savePreferences: vi.fn<typeof savePreferences>().mockResolvedValue(undefined),
}))
vi.mock('./window-messages.js', () => ({
	postWindowMessage: vi.fn((message: unknown) => structuredClone(message)),
}))

describe('preference actions', () => {
	it('persists preset edits while retaining other settings and broadcasting plain data', async () => {
		const previous = {
			...defaultPreferences(),
			repositoryShortcuts: { ...createRepositoryShortcuts(), copyPath: true, website: true },
		}
		const next = await savePreferenceChanges(previous, {
			columnPresets: [{ columns: new Proxy(['name'], {}), id: 'custom:fixture', label: 'Fixture' }],
			filterPresets: [
				{ filter: new Proxy(getPresetFilter('clean'), {}), id: 'custom:fixture', label: 'Fixture' },
			],
		})
		expect(next.columnPresets).toEqual([
			{ columns: ['name'], id: 'custom:fixture', label: 'Fixture' },
		])
		expect(next.filterPresets).toHaveLength(1)
		expect(next.repositoryShortcuts).toEqual(previous.repositoryShortcuts)
		expect(next.identity).toEqual(previous.identity)
		expect(savePreferences).toHaveBeenCalledWith(next)
		expect(postWindowMessage).toHaveBeenCalledWith({
			preferences: next,
			type: 'preferences-changed',
		})
		expect(() => structuredClone(next)).not.toThrow()
	})

	it('broadcasts saved menu changes even when the current identity is reactive', async () => {
		const previous = defaultPreferences()
		const next = {
			...previous,
			identity: new Proxy(previous.identity, {}),
			repositoryShortcuts: createRepositoryShortcuts(true),
		}
		expect(() => structuredClone(next)).toThrow()
		await updatePreferences(previous, next, undefined, true)
		expect(savePreferences).toHaveBeenCalledWith(next)
		expect(postWindowMessage).toHaveBeenCalledWith({
			preferences: { ...previous, repositoryShortcuts: createRepositoryShortcuts(true) },
			type: 'preferences-changed',
		})
	})
})
