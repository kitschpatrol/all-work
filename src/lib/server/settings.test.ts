import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultPreferences } from '../preferences.js'
import { parseSavedView } from '../view-storage.js'
import { readSettings, resetSavedView, saveSettings, settingsDirectory } from './settings.js'

let temporaryDirectory: string
beforeEach(async () => {
	temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'allwork-settings-'))
	vi.stubEnv('ALLWORK_SETTINGS_DIRECTORY', path.join(temporaryDirectory, 'settings'))
})
afterEach(async () => {
	await rm(temporaryDirectory, { force: true, recursive: true })
	vi.unstubAllEnvs()
})

describe('system JSON settings', () => {
	it('uses the system application-data location or an explicit override', () => {
		expect(settingsDirectory()).toBe(path.join(temporaryDirectory, 'settings'))
		vi.stubEnv('ALLWORK_SETTINGS_DIRECTORY', undefined)
		const base =
			process.platform === 'darwin'
				? path.join(os.homedir(), 'Library', 'Application Support')
				: process.platform === 'win32'
					? (process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'))
					: (process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'))
		expect(settingsDirectory()).toBe(path.join(base, 'AllWork'))
	})

	it('creates separate readable JSON files and restores them after the settings module is reloaded', async () => {
		const preferences = defaultPreferences()
		const view = parseSavedView(
			{ columnSizing: { name: 140 }, command: 'printf draft', runIds: ['cached-run'] },
			'/projects',
		)
		await Promise.all([saveSettings('preferences', preferences), saveSettings('view', view)])
		expect(await readdir(settingsDirectory())).toEqual(['preferences.json', 'view.json'])
		const text = await readFile(path.join(settingsDirectory(), 'preferences.json'), 'utf8')
		expect(text).toContain('\n\t"identity":')
		expect(JSON.parse(text) as unknown).toEqual(preferences)
		vi.resetModules()
		const restored = await import('./settings.js')
		expect(await restored.readSettings()).toEqual({ preferences, view })
	})

	it.skipIf(process.platform === 'win32')(
		'restricts settings files to the current user',
		async () => {
			await saveSettings('preferences', defaultPreferences())
			const permissions = await stat(path.join(settingsDirectory(), 'preferences.json'))
			expect(permissions.mode.toString(8).slice(-3)).toBe('600')
		},
	)

	it('returns defaults for missing and malformed JSON without affecting the other file', async () => {
		expect(await readSettings()).toEqual({ preferences: undefined, view: undefined })
		await saveSettings('preferences', defaultPreferences())
		await writeFile(path.join(settingsDirectory(), 'view.json'), '{broken')
		expect(await readSettings()).toEqual({ preferences: defaultPreferences(), view: undefined })
	})

	it('keeps the latest view when saves arrive out of order or overlap', async () => {
		const id = randomUUID()
		await Promise.all([
			saveSettings('view', { command: 'old' }, { id, sequence: 1 }),
			saveSettings('view', { command: 'new' }, { id, sequence: 3 }),
			saveSettings('view', { command: 'late old request' }, { id, sequence: 2 }),
		])
		expect(await readSettings()).toMatchObject({ view: { command: 'new' } })
		expect(await readdir(settingsDirectory())).toEqual(['view.json'])
	})

	it('resets only the view and rejects late writes from before the reset', async () => {
		const id = randomUUID()
		await saveSettings('preferences', defaultPreferences())
		await saveSettings('view', { command: 'old' }, { id, sequence: 1 })
		await resetSavedView({ id, sequence: 3 })
		await saveSettings('view', { command: 'late' }, { id, sequence: 2 })
		expect(await readSettings()).toEqual({ preferences: defaultPreferences(), view: undefined })
		expect(await readdir(settingsDirectory())).toEqual(['preferences.json'])
	})

	it('surfaces disk failures and can save again after the filesystem is repaired', async () => {
		await mkdir(temporaryDirectory, { recursive: true })
		await writeFile(settingsDirectory(), 'blocked directory')
		await expect(saveSettings('preferences', defaultPreferences())).rejects.toThrow()
		await rm(settingsDirectory())
		await saveSettings('preferences', defaultPreferences())
		expect(await readSettings()).toMatchObject({ preferences: defaultPreferences() })
	})
})
