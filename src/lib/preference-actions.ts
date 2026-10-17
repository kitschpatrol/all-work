import type { Preferences } from './preferences.js'
import type { Workspace } from './workspace.js'
import { request } from './client-request.js'
import { parsePreferences } from './preferences.js'
import { savePreferences } from './view-storage.js'
import { postWindowMessage } from './window-messages.js'

/**
 * Save menu changes and refresh repository identity only when its settings
 * change.
 */
export async function updatePreferences(
	previous: Preferences,
	next: Preferences,
	workspace: undefined | Workspace,
	persist = false,
): Promise<void> {
	if (persist) {
		await savePreferences(next)
	}

	if (
		workspace !== undefined &&
		JSON.stringify(previous.identity) !== JSON.stringify(next.identity)
	) {
		await request('/api/workspace/metadata', {
			force: true,
			groups: ['local'],
			identity: next.identity,
			repositoryIds: workspace.repositories.map((repository) => repository.id),
			workspaceId: workspace.id,
		})
	}

	if (persist) {
		postWindowMessage({ preferences: parsePreferences(next), type: 'preferences-changed' })
	}
}
