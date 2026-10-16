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
		groups: Partial<Record<MetadataGroup, MetadataState>>
		values: Record<string, MetadataValue>
	}
	name: string
	packageManager: string
	path: string
	relativePath: string
	remote: string
	repoName: string
	repoOwner: string
	version: string
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
	results: Record<string, CommandResult>
}

export type RunEvent =
	| { result: CommandResult; type: 'result' }
	| { run: CommandRun; type: 'snapshot' }
	| { type: 'finished' }

export type StreamEvent = RunEvent & { runId: string }
import type { ProjectIdentity } from './preferences.js'
