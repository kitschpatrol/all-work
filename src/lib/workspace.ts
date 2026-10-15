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
	name: string
	packageManager: string
	path: string
	relativePath: string
	remote: string
	version: string
}

export type Workspace = {
	directory: string
	id: string
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
