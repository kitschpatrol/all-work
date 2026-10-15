import { error } from '@sveltejs/kit'
import { execFile } from 'node:child_process'
import { getWorkspace, verifyRepository } from './repositories.js'
import { readRequest } from './request.js'

// Resolve the preferred UNIX executable handler without opening the executable.
const defaultTerminalScript = `
ObjC.import('AppKit')
const application = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL(
	$.NSURL.fileURLWithPath('/bin/zsh')
)
ObjC.unwrap(application.path)
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

/** Open a scanned repository folder in a supported native macOS application. */
export async function openRepository(
	request: Request,
	url: URL,
	app: 'Finder' | 'Terminal' | 'Tower',
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
		const targetApp =
			app === 'Terminal'
				? await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', defaultTerminalScript])
				: app
		if (targetApp === '') {
			throw new Error('No default terminal application is configured in macOS.')
		}

		await execute('/usr/bin/open', ['-a', targetApp, '--', repository.path])
		return Response.json({ opened: true })
	} catch (error_) {
		error(
			400,
			error_ instanceof Error ? error_.message : `Could not open this repository in ${app}.`,
		)
	}
}
