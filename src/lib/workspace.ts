export type MetadataGroup =
	'ci' | 'code' | 'files' | 'git' | 'github' | 'local' | 'registry' | 'updates'
export type MetadataValue = boolean | number | string | string[]
export type MetadataState = {
	cached?: boolean
	error?: string
	status: 'error' | 'loading' | 'queued' | 'ready' | 'unavailable'
	updatedAt?: string
}

export type Repository = {
	ahead: number
	behind: number
	branch: string
	changedFiles: number
	description: string
	error?: string
	gitStatusAvailable: boolean
	id: string
	lastCommit: string
	lastCommitDate: string
	metadata?: {
		groups: MetadataGroups
		values: Record<string, MetadataValue>
	}
	name: string
	packageManager: string
	path: string
	/**
	 * File name of the readme in the repository root, or empty when there is
	 * none.
	 */
	readme: string
	relativePath: string
	remote: string
	repoName: string
	repoOwner: string
	/**
	 * Upstream the current branch tracks, such as `origin/main`, or empty without
	 * one.
	 */
	upstream: string
	/** Whether the upstream is configured but its ref is missing locally. */
	upstreamGone: boolean
	version: string
	/** Website from GitHub's About section, empty without a distinct website. */
	website: string
}

/** Loading states for each metadata group. */
export type MetadataGroups = Partial<Record<MetadataGroup, MetadataState>>

/** Whether a repository's row data changed, or only its metadata loading states. */
export type MetadataChange = 'row' | 'status'

/**
 * Repository changes streamed to the page: whole rows that changed, and the
 * loading states of rows whose data did not.
 */
export type MetadataEvent = {
	repositories: Repository[]
	snapshot: boolean
	statuses: Array<{ groups: MetadataGroups; id: string }>
}

export type Workspace = {
	directory: string
	id: string
	identity?: ProjectIdentity
	recursive: boolean
	repositories: Repository[]
	warnings: string[]
}

type CommandResult = {
	/**
	 * The command with this repository's column variables filled in, when it
	 * references any.
	 */
	command?: string
	duration?: number
	exitCode?: number
	output: string
	repositoryId: string
	status: 'cancelled' | 'failed' | 'queued' | 'running' | 'success'
	truncated: boolean
}

export type CommandRun = {
	command: string
	concurrency: number
	createdAt: string
	finished: boolean
	id: string
	/**
	 * Counts up from 1 per saved view and is never reused, so it always names the
	 * same run.
	 */
	number: number
	results: Record<string, CommandResult>
}

export type RunEvent =
	| { result: CommandResult; type: 'result' }
	| { run: CommandRun; type: 'snapshot' }
	| { type: 'finished' }

export type StreamEvent = RunEvent & { runId: string }
import type { ProjectIdentity } from './preferences.js'
