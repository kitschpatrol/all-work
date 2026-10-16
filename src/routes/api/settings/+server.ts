import type { SettingsWriter } from '#lib/server/settings.js'
import { error } from '@sveltejs/kit'
import { asRecord, parseIdentity, parsePreferences } from '#lib/preferences.js'
import { readRequest } from '#lib/server/request.js'
import { readSettings, resetSavedView, saveSettings } from '#lib/server/settings.js'
import { parseSavedView } from '#lib/view-storage.js'
import type { RequestHandler } from './$types'

function readWriter(value: unknown): SettingsWriter {
	const writer = asRecord(value)
	if (
		typeof writer?.id !== 'string' ||
		writer.id.length > 100 ||
		typeof writer.sequence !== 'number' ||
		!Number.isSafeInteger(writer.sequence) ||
		writer.sequence < 1
	) {
		error(400, 'Invalid settings writer.')
	}

	return { id: writer.id, sequence: writer.sequence }
}

export const POST: RequestHandler = async ({ request, url }) => {
	await readRequest(request, url)
	try {
		return Response.json(await readSettings())
	} catch {
		error(500, 'Settings could not be read from disk.')
	}
}

export const PUT: RequestHandler = async ({ request, url }) => {
	const body = await readRequest(request, url, 2_000_000)
	const value = asRecord(body.value)
	if (value?.version !== 1 || (body.kind !== 'preferences' && body.kind !== 'view')) {
		error(400, 'Invalid settings.')
	}

	if (
		body.kind === 'preferences' &&
		(parseIdentity(value.identity) === undefined || typeof value.restoreWorkspace !== 'boolean')
	) {
		error(400, 'Invalid identity preferences.')
	}

	const writer = body.kind === 'view' ? readWriter(body.writer) : undefined
	const settings = body.kind === 'preferences' ? parsePreferences(value) : parseSavedView(value, '')
	try {
		await saveSettings(body.kind, settings, writer)
		return Response.json({ saved: true })
	} catch {
		error(500, 'Settings could not be saved to disk.')
	}
}

export const DELETE: RequestHandler = async ({ request, url }) => {
	const body = await readRequest(request, url)
	if (body.kind !== 'view') {
		error(400, 'Choose the saved view to reset.')
	}

	const writer = readWriter(body.writer)
	try {
		await resetSavedView(writer)
		return Response.json({ reset: true })
	} catch {
		error(500, 'The saved view could not be reset.')
	}
}
