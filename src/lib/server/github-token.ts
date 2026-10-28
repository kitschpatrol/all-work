// eslint-disable-next-line depend/ban-dependencies -- Execa captures the user shell's command descriptor with a timeout.
import { execa } from 'execa'
import os from 'node:os'
import { userShellCommand } from './user-shell.js'

/**
 * Find a GitHub token in `GITHUB_TOKEN`, then `GH_TOKEN`, then from the GitHub
 * CLI. The CLI runs through the user's login shell, whose `PATH` finds it even
 * when the app opens from the Finder with a minimal environment.
 *
 * @returns The token, or `undefined` when none is available.
 */
export async function resolveGithubToken(): Promise<string | undefined> {
	const environmentToken = [process.env.GITHUB_TOKEN, process.env.GH_TOKEN].find(
		(token) => token !== undefined && token !== '',
	)
	if (environmentToken !== undefined) {
		return environmentToken
	}

	const { args, file } = userShellCommand('gh auth token', os.homedir())
	const result = await execa(file, args, {
		reject: false,
		stdio: ['ignore', 'pipe', 'ignore', 'pipe'],
		timeout: 10_000,
	})
	const output = process.platform === 'win32' ? result.stdout : result.stdio[3]
	const token = typeof output === 'string' && result.exitCode === 0 ? output.trim() : ''
	return token === '' ? undefined : token
}
