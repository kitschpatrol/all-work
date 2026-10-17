import { describe, expect, it, vi } from 'vitest'
import { updatePreferences } from './preference-actions.js'
import { defaultPreferences } from './preferences.js'
import { savePreferences } from './view-storage.js'
import { postWindowMessage } from './window-messages.js'

vi.mock('./view-storage.js', () => ({
	savePreferences: vi.fn<typeof savePreferences>().mockResolvedValue(undefined),
}))
vi.mock('./window-messages.js', () => ({
	postWindowMessage: vi.fn((message: unknown) => structuredClone(message)),
}))

describe('preference actions', () => {
	it('broadcasts saved menu changes even when the current identity is reactive', async () => {
		const previous = defaultPreferences()
		const next = {
			...previous,
			identity: new Proxy(previous.identity, {}),
			showRepositoryShortcuts: true,
		}
		expect(() => structuredClone(next)).toThrow()
		await updatePreferences(previous, next, undefined, true)
		expect(savePreferences).toHaveBeenCalledWith(next)
		expect(postWindowMessage).toHaveBeenCalledWith({
			preferences: { ...previous, showRepositoryShortcuts: true },
			type: 'preferences-changed',
		})
	})
})
