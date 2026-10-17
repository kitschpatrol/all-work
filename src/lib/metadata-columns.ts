/* eslint-disable ts/naming-convention -- Frontmatter keys preserve the Metascope template spelling. */
import type { MetadataGroup, MetadataValue, Repository } from './workspace.js'

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

function formatUpdatedAt(value: string) {
	const seconds = (Date.parse(value) - Date.now()) / 1000
	if (!Number.isFinite(seconds)) {
		return 'at an unknown time'
	}

	if (Math.abs(seconds) < 10) {
		return 'just now'
	}

	const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
		['year', 31_536_000],
		['month', 2_592_000],
		['week', 604_800],
		['day', 86_400],
		['hour', 3600],
		['minute', 60],
		['second', 1],
	]
	for (const [unit, duration] of units) {
		if (Math.abs(seconds) >= duration) {
			return relativeTime.format(Math.trunc(seconds / duration), unit)
		}
	}

	return 'just now'
}

/**
 * Numbers right-align in monospace; code is monospace; text is set in the
 * system font.
 */
export type ColumnDisplay = 'code' | 'number' | 'text'

/** The type of value a column holds, which decides how rules compare it. */
export type ColumnKind = 'boolean' | 'date' | 'list' | 'number' | 'text'

type MetadataColumn = {
	category: string
	display: ColumnDisplay
	field: string
	group: MetadataGroup
	kind: ColumnKind
	note?: string
	sort: 'alphanumeric' | 'basic'
	visible?: boolean
}

const identity = [
	'Name',
	'ID',
	'Description',
	'Author',
	'Contributor',
	'Maintainer',
	'Version',
	'Status',
	'Tags',
	'License',
]
const paths = [
	'Repo Path',
	'VS Code Path',
	'Readme Path',
	'Folder Name',
	'Homepage URL',
	'Repo URL',
	'Issues URL',
	'Readme URL',
]
const platform = [
	'Dependencies',
	'Dev Dependencies',
	'Runtime',
	'Operating System',
	'Homebrew',
	'Monorepo',
]
const git = [
	'Created',
	'First Commit Date',
	'Latest Commit Date',
	'Contributors',
	'Tracked Files',
	'Tracked Size MB',
	'Git Commits',
	'Git Dirty Files',
	'Git Remotes Ahead',
	'Git Remotes Behind',
	'Git LFS',
	'Git Tags',
	'Git Current Branch',
	'Git Branches',
	'Git Remotes',
	'Git Submodules',
]
const github = [
	'Account',
	'Public',
	'Fork',
	'Language',
	'Latest Push Date',
	'Stars',
	'Watchers',
	'Forks',
	'Issues Open',
	'Issues Closed',
	'PRs Open',
	'PRs Merged',
	'PRs Closed',
	'Vulnerability Alerts',
	'GitHub Size MB',
	'Forked From',
	'Fork Ahead',
	'Fork Behind',
	'Template From',
	'Organization',
	'Latest Release Date',
	'Latest Release Version',
	'Releases',
]
const registry = ['Published', 'Package URL', 'Downloads Total', 'Downloads Monthly']
const defaultFields = new Set([
	'CI',
	'Fork',
	'Issues Open',
	'Language',
	'License',
	'PRs Open',
	'Public',
	'Published',
	'Stars',
	'Status',
])
const basicFields = new Set([
	'Contributors',
	'Downloads Monthly',
	'Downloads Total',
	'Fork',
	'Fork Ahead',
	'Fork Behind',
	'Forks',
	'Git Branches',
	'Git Commits',
	'Git Dirty Files',
	'GitHub Size MB',
	'Git LFS',
	'Git Remotes',
	'Git Remotes Ahead',
	'Git Remotes Behind',
	'Git Submodules',
	'Git Tags',
	'Homebrew',
	'Issues Closed',
	'Issues Open',
	'Libyears',
	'Lines of Code',
	'Major Updates',
	'Minor Updates',
	'Monorepo',
	'Organization',
	'Patch Updates',
	'PRs Closed',
	'PRs Merged',
	'PRs Open',
	'Public',
	'Published',
	'Releases',
	'Stars',
	'Total Files',
	'Total Size MB',
	'Total Updates',
	'Tracked Files',
	'Tracked Size MB',
	'Vulnerability Alerts',
	'Watchers',
])
const booleanFields = new Set([
	'Fork',
	'Git LFS',
	'Homebrew',
	'Monorepo',
	'Organization',
	'Public',
	'Published',
])
const numberFields = basicFields.difference(booleanFields)
const dateFields = new Set([
	'Created',
	'First Commit Date',
	'Latest Commit Date',
	'Latest Push Date',
	'Latest Release Date',
])
// Metascope reports these as string arrays; cells join them with commas
const listFields = new Set([
	'Author',
	'Contributor',
	'Dependencies',
	'Dev Dependencies',
	'Language',
	'License',
	'Maintainer',
	'Operating System',
	'Runtime',
	'Secondary Language',
	'Tags',
])
// Versions, dates, paths, and URLs are compared character by character down a column
const codeFields = new Set([
	'CI URL',
	'Created',
	'First Commit Date',
	'Homepage URL',
	'ID',
	'Issues URL',
	'Latest Push Date',
	'Latest Release Date',
	'Latest Release Version',
	'Package URL',
	'Readme Path',
	'Readme URL',
	'Repo Path',
	'Repo URL',
	'VS Code Path',
])
const notes: Record<string, string> = {
	CI: 'Latest completed default-branch run of a workflow named CI.',
	Contributors: 'Unique Git author emails; distinct from the Contributor names column.',
	Created: 'First Git commit date, with GitHub creation date or manifest date as fallback.',
	'Downloads Monthly': 'Monthly npm or PyPI downloads.',
	'Downloads Total':
		'Source-dependent: npm lifetime, Obsidian community count, PyPI 180 days, or latest GitHub release assets.',
	'Fork Ahead': 'GitHub comparison with the parent fork; distinct from local remote totals.',
	'Fork Behind': 'GitHub comparison with the parent fork; distinct from local remote totals.',
	'Git LFS': 'True when Metascope detects LFS files; unknown when detection provides no result.',
	'Git Remotes Ahead': 'Total against locally cached main/master refs across remotes. No fetch.',
	'Git Remotes Behind': 'Total against locally cached main/master refs across remotes. No fetch.',
	Homebrew: 'Depends on brewpub; does not verify a published Homebrew formula.',
	'Latest Release Date': 'GitHub release date, registry metadata, or local version-tag date.',
	'Latest Release Version':
		'Obsidian manifest version, registry version, GitHub release, or local version tag.',
	Monorepo: 'Inferred from root workspace configuration, without extracting child workspaces.',
	Releases: 'GitHub releases, with local version-tag count as fallback.',
	Status: 'Your authorship or maintenance relationship; provisional until fork metadata loads.',
	'Vulnerability Alerts': 'Requires suitable GitHub permissions. Unavailable does not mean zero.',
}

function fields(names: string[], group: MetadataGroup, category: string): MetadataColumn[] {
	return names.map((field) => ({
		category,
		display: numberFields.has(field) ? 'number' : codeFields.has(field) ? 'code' : 'text',
		field,
		group,
		kind: booleanFields.has(field)
			? 'boolean'
			: numberFields.has(field)
				? 'number'
				: dateFields.has(field)
					? 'date'
					: listFields.has(field)
						? 'list'
						: 'text',
		note: notes[field],
		sort: basicFields.has(field) ? 'basic' : 'alphanumeric',
		visible: defaultFields.has(field),
	}))
}

export const metadataColumns: MetadataColumn[] = [
	...fields(identity, 'local', 'Identity'),
	...fields(paths, 'local', 'Paths and links'),
	...fields(platform, 'local', 'Dependencies and platform'),
	...fields(git, 'git', 'Git'),
	...fields(github, 'github', 'GitHub and releases'),
	...fields(registry, 'registry', 'Packages'),
	...fields(['CI', 'CI URL'], 'ci', 'CI'),
	...fields(['Secondary Language', 'Lines of Code'], 'code', 'Codebase scans'),
	...fields(['Total Files', 'Total Size MB'], 'files', 'Codebase scans'),
	...fields(
		['Major Updates', 'Minor Updates', 'Patch Updates', 'Total Updates', 'Libyears'],
		'updates',
		'Dependency updates',
	),
]

export const metadataGroups: Record<MetadataGroup, string> = {
	ci: 'CI status',
	code: 'Code statistics',
	files: 'File statistics',
	git: 'Git statistics',
	github: 'GitHub metadata',
	local: 'Local metadata',
	registry: 'Package registries',
	updates: 'Dependency updates',
}

/** Format raw values consistently in table cells, hovers, and shell variables. */
export function metadataText(value: MetadataValue | undefined): string {
	return value === undefined ? '' : Array.isArray(value) ? value.join(', ') : String(value)
}

/**
 * Describe availability and freshness without treating unloaded fields as false
 * or zero.
 */
export function metadataHint(repository: Repository, group: MetadataGroup): string {
	const state = repository.metadata?.groups[group]
	if (state === undefined) {
		return `${metadataGroups[group]}: not loaded`
	}

	return [
		metadataGroups[group],
		state.status,
		state.cached === true ? 'cached' : '',
		state.updatedAt === undefined ? '' : `Updated ${formatUpdatedAt(state.updatedAt)}`,
		state.error ?? '',
	]
		.filter(Boolean)
		.join(' · ')
}
