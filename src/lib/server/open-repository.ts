import type { AppChoices, InstalledApp } from '#lib/preferences.js'
import type { Repository } from '#lib/workspace.js'
import { error } from '@sveltejs/kit'
import { isBundleId, parsePreferences } from '#lib/preferences.js'
import { asRecord } from '#lib/record.js'
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { findReadme } from './readme.js'
import { getWorkspace, verifyRepository } from './repositories.js'
import { readRequest } from './request.js'
import { readSettings } from './settings.js'

// Resolve the preferred UNIX executable handler without opening the executable.
const defaultTerminalScript = `
ObjC.import('AppKit')
const application = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL(
	$.NSURL.fileURLWithPath('/bin/zsh')
)
ObjC.unwrap(application.path)
`

// List the applications Launch Services offers for an existing Markdown file,
// the same set as Finder's Open With menu.
const markdownAppsScript = `
ObjC.import('AppKit')
function run([file]) {
	const workspace = $.NSWorkspace.sharedWorkspace
	const url = $.NSURL.fileURLWithPath(file)
	const describe = (app) => ({
		id: ObjC.unwrap($.NSBundle.bundleWithURL(app).bundleIdentifier) ?? '',
		path: ObjC.unwrap(app.path),
	})
	const fallback = workspace.URLForApplicationToOpenURL(url)
	return JSON.stringify({
		apps: ObjC.unwrap(workspace.URLsForApplicationsToOpenURL(url)).map(describe),
		defaultApp: fallback.isNil() ? undefined : describe(fallback),
	})
}
`

// Find which of the given terminal apps are installed. The system default is
// the UNIX executable handler, which macOS may assign to a non-terminal app.
const terminalAppsScript = `
ObjC.import('AppKit')
function run(ids) {
	const workspace = $.NSWorkspace.sharedWorkspace
	const describe = (app) => ({
		id: ObjC.unwrap($.NSBundle.bundleWithURL(app).bundleIdentifier) ?? '',
		path: ObjC.unwrap(app.path),
	})
	const fallback = workspace.URLForApplicationToOpenURL($.NSURL.fileURLWithPath('/bin/zsh'))
	return JSON.stringify({
		apps: ids
			.map((id) => workspace.URLForApplicationWithBundleIdentifier(id))
			.filter((app) => !app.isNil())
			.map(describe),
		defaultApp: fallback.isNil() ? undefined : describe(fallback),
	})
}
`

// Terminals known to open a new window in a folder passed to `open`
const terminalBundleIds = [
	'com.apple.Terminal',
	'com.github.wez.wezterm',
	'com.googlecode.iterm2',
	'com.mitchellh.ghostty',
	'dev.warp.Warp-Stable',
	'net.kovidgoyal.kitty',
]

async function execute(command: string, args: string[]): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		execFile(command, args, { timeout: 15_000 }, (cause, stdout) => {
			if (cause instanceof Error) {
				reject(cause)
			} else {
				resolve(stdout.trim())
			}
		})
	})
}

async function launchArguments(
	app: 'Finder' | 'Readme' | 'Terminal' | 'Tower',
	repository: Repository,
): Promise<string[]> {
	if (app === 'Finder') {
		return ['-R', '--', repository.path]
	}

	if (app === 'Readme') {
		const readme = findReadme(await readdir(repository.path, { withFileTypes: true }))
		if (readme === '') {
			throw new Error(`No readme found in ${repository.name}.`)
		}

		const settings = await readSettings()
		const { readmeApp } = parsePreferences(settings.preferences)
		return [
			...(readmeApp === '' ? [] : ['-b', readmeApp]),
			'--',
			path.join(repository.path, readme),
		]
	}

	if (app === 'Tower') {
		return ['-a', app, '--', repository.path]
	}

	const settings = await readSettings()
	const { terminalApp } = parsePreferences(settings.preferences)
	if (terminalApp !== '') {
		return ['-b', terminalApp, '--', repository.path]
	}

	const targetApp = await execute('/usr/bin/osascript', [
		'-l',
		'JavaScript',
		'-e',
		defaultTerminalScript,
	])
	if (targetApp === '') {
		throw new Error('No default terminal application is configured in macOS.')
	}

	return ['-a', targetApp, '--', repository.path]
}

/**
 * Open a scanned repository folder in a supported native macOS application, or
 * its readme or a terminal in the application chosen in preferences.
 */
export async function openRepository(
	request: Request,
	url: URL,
	app: 'Finder' | 'Readme' | 'Terminal' | 'Tower',
): Promise<Response> {
	const body = await readRequest(request, url)
	const workspace =
		typeof body.workspaceId === 'string' ? getWorkspace(body.workspaceId) : undefined
	const repository = workspace?.repositories.find((entry) => entry.id === body.repositoryId)
	if (repository === undefined) {
		error(404, 'Reload the folder and choose a repository from the table.')
	}

	if (process.platform !== 'darwin') {
		error(400, `Opening a local repository in ${app} is currently supported on macOS.`)
	}

	try {
		await verifyRepository(repository)
		await execute('/usr/bin/open', await launchArguments(app, repository))
		return Response.json({ opened: true })
	} catch (error_) {
		error(
			400,
			error_ instanceof Error ? error_.message : `Could not open this repository in ${app}.`,
		)
	}
}

function readApp(value: unknown): InstalledApp | undefined {
	const app = asRecord(value)
	return isBundleId(app?.id) && typeof app.path === 'string' && app.path !== ''
		? { id: app.id, name: path.basename(app.path, '.app') }
		: undefined
}

/**
 * Name apps as Finder names them and sort them by name, with one entry per
 * bundle identifier.
 */
function readAppChoices(output: string): AppChoices {
	const result = asRecord(JSON.parse(output) as unknown)
	const entries: unknown[] = Array.isArray(result?.apps) ? result.apps : []
	const apps = new Map<string, InstalledApp>()
	for (const entry of entries) {
		const app = readApp(entry)
		if (app !== undefined && !apps.has(app.id)) {
			apps.set(app.id, app)
		}
	}

	return {
		apps: apps
			.values()
			.toArray()
			.toSorted((a, b) => a.name.localeCompare(b.name)),
		defaultName: readApp(result?.defaultApp)?.name ?? '',
	}
}

/** List installed applications that can open Markdown readmes. */
export async function listReadmeApps(request: Request, url: URL): Promise<Response> {
	await readRequest(request, url)
	if (process.platform !== 'darwin') {
		return Response.json({ apps: [], defaultName: '' } satisfies AppChoices)
	}

	// Launch Services only answers for files that exist
	const directory = await mkdtemp(path.join(os.tmpdir(), 'all-work-readme-'))
	try {
		const sample = path.join(directory, 'readme.md')
		await writeFile(sample, '# Readme\n')
		return Response.json(
			readAppChoices(
				await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', markdownAppsScript, sample]),
			),
		)
	} catch (error_) {
		error(
			500,
			`Could not list applications for readmes: ${error_ instanceof Error ? error_.message : String(error_)}`,
		)
	} finally {
		await rm(directory, { force: true, recursive: true })
	}
}

/** List the installed terminal applications that repositories can open in. */
export async function listTerminalApps(request: Request, url: URL): Promise<Response> {
	await readRequest(request, url)
	if (process.platform !== 'darwin') {
		return Response.json({ apps: [], defaultName: '' } satisfies AppChoices)
	}

	try {
		return Response.json(
			readAppChoices(
				await execute('/usr/bin/osascript', [
					'-l',
					'JavaScript',
					'-e',
					terminalAppsScript,
					...terminalBundleIds,
				]),
			),
		)
	} catch (error_) {
		error(
			500,
			`Could not list terminal applications: ${error_ instanceof Error ? error_.message : String(error_)}`,
		)
	}
}
