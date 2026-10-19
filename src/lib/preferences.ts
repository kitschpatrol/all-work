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

export type Preferences = {
	columnPresets: ColumnPreset[]
	filterPresets: FilterPreset[]
	identity: ProjectIdentity
	restoreWorkspace: boolean
	showRepositoryShortcuts: boolean
	version: 1
}

const separator = /[,\n]/v
const accountPrefix = /^@/v

/**
 * Provide the initial identity, appearance, and workspace restoration
 * preferences.
 */
export function defaultPreferences(): Preferences {
	return {
		columnPresets: [],
		filterPresets: [],
		identity: {
			authorNames: ['Eric Mika', 'kitschpatrol', 'scalarstudio'],
			githubAccounts: ['kitschpatrol', 'scalarstudio'],
		},
		restoreWorkspace: true,
		showRepositoryShortcuts: false,
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
	return {
		columnPresets: parseColumnPresets(record?.columnPresets),
		filterPresets: parseFilterPresets(record?.filterPresets),
		identity: parseIdentity(record?.identity) ?? defaults.identity,
		restoreWorkspace: record?.restoreWorkspace !== false,
		showRepositoryShortcuts: record?.showRepositoryShortcuts === true,
		version: 1,
	}
}
