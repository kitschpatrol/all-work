import { execFile } from 'node:child_process'

/**
 * Run Git with bounded output and time, without taking optional repository
 * locks.
 */
export async function git(directory: string, args: string[]): Promise<string> {
	const environment = {
		...process.env,
		// eslint-disable-next-line ts/naming-convention -- Git expects this exact environment variable name.
		GIT_OPTIONAL_LOCKS: '0',
	}
	const stdout = await new Promise<string>((resolve, reject) => {
		execFile(
			'git',
			['-C', directory, ...args],
			{ env: environment, maxBuffer: 4 * 1024 * 1024, timeout: 15_000 },
			(error, output) => {
				if (error instanceof Error) {
					reject(error)
				} else {
					resolve(output)
				}
			},
		)
	})
	return stdout.trim()
}

/**
 * Read optional Git metadata, treating absent refs or configuration as
 * unavailable.
 */
export async function optionalGit(directory: string, args: string[]): Promise<string> {
	try {
		return await git(directory, args)
	} catch {
		return ''
	}
}
