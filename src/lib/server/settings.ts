import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

type SettingsKind = 'preferences' | 'view'
export type SettingsWriter = { id: string; sequence: number }

const writes = new Map<string, Promise<void>>()
const revisions = new Map<string, number>()

/**
 * Resolve the same system application-data directory in Electron and the
 * browser server.
 */
export function settingsDirectory() {
	if (process.env.ALLWORK_SETTINGS_DIRECTORY !== undefined) {
		return path.resolve(process.env.ALLWORK_SETTINGS_DIRECTORY)
	}

	const home = os.homedir()
	const base =
		process.platform === 'darwin'
			? path.join(home, 'Library', 'Application Support')
			: process.platform === 'win32'
				? (process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'))
				: (process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'))
	return path.join(base, 'AllWork')
}

function filePath(kind: SettingsKind) {
	return path.join(settingsDirectory(), `${kind}.json`)
}

async function readJson(kind: SettingsKind): Promise<unknown> {
	const file = filePath(kind)
	await writes.get(file)
	try {
		return JSON.parse(await readFile(file, 'utf8')) as unknown
	} catch (error) {
		if (
			error instanceof SyntaxError ||
			(error instanceof Error && 'code' in error && error.code === 'ENOENT')
		) {
			return undefined
		}

		throw error
	}
}

/**
 * Read preferences and view state without depending on a browser profile or
 * origin.
 */
export async function readSettings() {
	const [preferences, view] = await Promise.all([readJson('preferences'), readJson('view')])
	return { preferences, view }
}

async function mutate(kind: SettingsKind, value: unknown, writer?: SettingsWriter) {
	const file = filePath(kind)
	const previous = writes.get(file)
	const key = writer === undefined ? undefined : `${file}\0${writer.id}`
	if (writer !== undefined && key !== undefined) {
		if (writer.sequence <= (revisions.get(key) ?? -1)) {
			return
		}

		revisions.set(key, writer.sequence)
		if (revisions.size > 1024) {
			const oldest = revisions.keys().next().value
			if (oldest !== undefined) {
				revisions.delete(oldest)
			}
		}
	}

	const text = value === undefined ? undefined : `${JSON.stringify(value, undefined, '\t')}\n`
	const next = (async () => {
		try {
			await previous
		} catch {
			/* A failed write must not block later saves or resets. */
		}

		if (writer !== undefined && key !== undefined && revisions.get(key) !== writer.sequence) {
			return
		}

		if (text === undefined) {
			await rm(file, { force: true })
			return
		}

		await mkdir(path.dirname(file), { mode: 0o700, recursive: true })
		const temporary = `${file}.${randomUUID()}.tmp`
		try {
			await writeFile(temporary, text, { mode: 0o600 })
			await rename(temporary, file)
		} finally {
			await rm(temporary, { force: true })
		}
	})()
	writes.set(file, next)
	try {
		await next
	} finally {
		if (writes.get(file) === next) {
			writes.delete(file)
		}
	}
}

/** Write a complete, versioned settings file atomically. */
export async function saveSettings(kind: SettingsKind, value: unknown, writer?: SettingsWriter) {
	await mutate(kind, value, writer)
}

/** Reset the table view while leaving identity preferences and caches intact. */
export async function resetSavedView(writer: SettingsWriter) {
	await mutate('view', undefined, writer)
}
