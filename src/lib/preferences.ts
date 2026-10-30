import type { ColumnPreset } from './column-presets.js'
import type { FilterPreset } from './filter-presets.js'
import { parseColumnPresets } from './column-presets.js'
import { parseFilterPresets } from './filter-presets.js'
import { asRecord } from './record.js'

export { asRecord } from './record.js'

export type ProjectIdentity = {
	authorNames: string[]
	githubAccounts: string[]
}

/** Shortcut choices in the order they appear in a repository cell. */
export const repositoryShortcutOptions = [
	{ id: 'readme', label: 'Open Readme' },
	{ id: 'tower', label: 'Open in Tower' },
	{ id: 'vscode', label: 'Open in VS Code' },
	{ id: 'github', label: 'Open in GitHub' },
	{ id: 'website', label: 'Open Website' },
	{ id: 'finder', label: 'Reveal in Finder' },
	{ id: 'copyPath', label: 'Copy Path' },
	{ id: 'terminal', label: 'Open in Terminal' },
	{ id: 'refresh', label: 'Refresh Metadata' },
] as const

export type RepositoryShortcuts = Record<(typeof repositoryShortcutOptions)[number]['id'], boolean>

export type Preferences = {
	columnPresets: ColumnPreset[]
	filterPresets: FilterPreset[]
	identity: ProjectIdentity
	/**
	 * Bundle identifier of the app that opens readmes, or empty for the system
	 * default.
	 */
	readmeApp: string
	repositoryShortcuts: RepositoryShortcuts
	restoreWorkspace: boolean
	/**
	 * Bundle identifier of the app that opens repositories in a terminal, or
	 * empty for the system default.
	 */
	terminalApp: string
	version: 1
}

/** Create a fresh set of shortcut choices with every button on or off. */
export function createRepositoryShortcuts(enabled = false): RepositoryShortcuts {
	return Object.fromEntries(
		repositoryShortcutOptions.map(({ id }) => [id, enabled]),
	) as RepositoryShortcuts
}

/** An installed application, by bundle identifier and the name Finder shows. */
export type InstalledApp = { id: string; name: string }

/** Applications offered for a task, and the name of the system default. */
export type AppChoices = { apps: InstalledApp[]; defaultName: string }

const separator = /[,\n]/v
const accountPrefix = /^@/v
const bundleIdPattern = /^[\dA-Za-z][\w.\-]*$/v

/** Accept a macOS bundle identifier such as `com.apple.TextEdit`. */
export function isBundleId(value: unknown): value is string {
	return typeof value === 'string' && value.length <= 255 && bundleIdPattern.test(value)
}

/**
 * Provide the initial identity, appearance, and workspace restoration
 * preferences.
 */
export function defaultPreferences(): Preferences {
	return {
		columnPresets: [],
		filterPresets: [],
		identity: {
			authorNames: [],
			githubAccounts: [],
		},
		readmeApp: '',
		repositoryShortcuts: {
			...createRepositoryShortcuts(),
			finder: true,
			github: true,
			refresh: true,
			terminal: true,
		},
		restoreWorkspace: true,
		terminalApp: '',
		version: 1,
	}
}

function names(value: unknown): string[] | undefined {
	return Array.isArray(value) &&
		value.length <= 100 &&
		value.every((entry: unknown) => typeof entry === 'string' && entry.length <= 200)
		? [...new Set((value as string[]).map((entry) => entry.trim()).filter(Boolean))]
		: undefined
}

/** Validate the identity passed into Metascope templates. */
export function parseIdentity(value: unknown): ProjectIdentity | undefined {
	const record = asRecord(value)
	const authorNames = names(record?.authorNames)
	const githubAccounts = names(record?.githubAccounts)
	return authorNames === undefined || githubAccounts === undefined
		? undefined
		: {
				authorNames,
				githubAccounts: [
					...new Set(
						githubAccounts.map((account) => account.replace(accountPrefix, '')).filter(Boolean),
					),
				],
			}
}

/** Accept one identity alias per line or comma-separated entry. */
export function parseIdentityNames(value: string) {
	return [
		...new Set(
			value
				.split(separator)
				.map((entry) => entry.trim())
				.filter(Boolean),
		),
	]
}

/** Recover valid preferences while tolerating damaged or older saved values. */
export function parsePreferences(value: unknown): Preferences {
	const record = asRecord(value)
	const defaults = defaultPreferences()
	const repositoryShortcuts = { ...defaults.repositoryShortcuts }
	const savedShortcuts = asRecord(record?.repositoryShortcuts)
	for (const { id } of repositoryShortcutOptions) {
		const enabled = savedShortcuts?.[id]
		if (typeof enabled === 'boolean') {
			repositoryShortcuts[id] = enabled
		}
	}

	return {
		columnPresets: parseColumnPresets(record?.columnPresets),
		filterPresets: parseFilterPresets(record?.filterPresets),
		identity: parseIdentity(record?.identity) ?? defaults.identity,
		readmeApp: isBundleId(record?.readmeApp) ? record.readmeApp : defaults.readmeApp,
		repositoryShortcuts,
		restoreWorkspace: record?.restoreWorkspace !== false,
		terminalApp: isBundleId(record?.terminalApp) ? record.terminalApp : defaults.terminalApp,
		version: 1,
	}
}
