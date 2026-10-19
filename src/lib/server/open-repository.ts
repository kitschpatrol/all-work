import type { ReadmeApp, ReadmeApps } from '#lib/preferences.js'
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

	const targetApp =
		app === 'Terminal'
			? await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', defaultTerminalScript])
			: app
	if (targetApp === '') {
		throw new Error('No default terminal application is configured in macOS.')
	}

	return ['-a', targetApp, '--', repository.path]
}

/**
 * Open a scanned repository folder in a supported native macOS application, or
 * its readme in the application chosen in preferences.
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

function readApp(value: unknown): ReadmeApp | undefined {
	const app = asRecord(value)
	return isBundleId(app?.id) && typeof app.path === 'string' && app.path !== ''
		? { id: app.id, name: path.basename(app.path, '.app') }
		: undefined
}

/**
 * List installed applications that can open Markdown readmes, named as Finder
 * names them and sorted by name, with one entry per bundle identifier.
 */
export async function listReadmeApps(request: Request, url: URL): Promise<Response> {
	await readRequest(request, url)
	if (process.platform !== 'darwin') {
		return Response.json({ apps: [], defaultName: '' } satisfies ReadmeApps)
	}

	// Launch Services only answers for files that exist
	const directory = await mkdtemp(path.join(os.tmpdir(), 'allwork-readme-'))
	try {
		const sample = path.join(directory, 'readme.md')
		await writeFile(sample, '# Readme\n')
		const output: unknown = JSON.parse(
			await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', markdownAppsScript, sample]),
		)
		const result = asRecord(output)
		const entries: unknown[] = Array.isArray(result?.apps) ? result.apps : []
		const apps = new Map<string, ReadmeApp>()
		for (const entry of entries) {
			const app = readApp(entry)
			if (app !== undefined && !apps.has(app.id)) {
				apps.set(app.id, app)
			}
		}

		return Response.json({
			apps: apps
				.values()
				.toArray()
				.toSorted((a, b) => a.name.localeCompare(b.name)),
			defaultName: readApp(result?.defaultApp)?.name ?? '',
		} satisfies ReadmeApps)
	} catch (error_) {
		error(
			500,
			`Could not list applications for readmes: ${error_ instanceof Error ? error_.message : String(error_)}`,
		)
	} finally {
		await rm(directory, { force: true, recursive: true })
	}
}
