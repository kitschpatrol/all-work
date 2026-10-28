import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveGithubToken } from './github-token.js'

let directory: string

// Stands in for the login shell, answering on the command's descriptor
async function fakeShell(name: string, script: string) {
	const file = path.join(directory, name)
	await writeFile(file, `#!/bin/sh\n${script}\n`)
	await chmod(file, 0o755)
	return file
}

beforeAll(async () => {
	directory = await mkdtemp(path.join(os.tmpdir(), 'all-work-github-token-'))
})

afterAll(async () => {
	await rm(directory, { force: true, recursive: true })
})

describe.skipIf(process.platform === 'win32')('GitHub token', () => {
	beforeEach(() => {
		vi.stubEnv('GITHUB_TOKEN', '')
		vi.stubEnv('GH_TOKEN', '')
	})

	afterEach(() => {
		vi.unstubAllEnvs()
	})

	it('prefers GITHUB_TOKEN, then GH_TOKEN, without asking the CLI', async () => {
		vi.stubEnv('SHELL', await fakeShell('unused', 'exit 99'))
		vi.stubEnv('GH_TOKEN', 'gh-environment')
		expect(await resolveGithubToken()).toBe('gh-environment')
		vi.stubEnv('GITHUB_TOKEN', 'github-environment')
		expect(await resolveGithubToken()).toBe('github-environment')
	})

	it('asks the GitHub CLI through the login shell, ignoring startup output', async () => {
		vi.stubEnv(
			'SHELL',
			await fakeShell('answers', "echo 'Welcome back'\nprintf 'cli-token\\n' >&3"),
		)
		expect(await resolveGithubToken()).toBe('cli-token')
	})

	it('finds no token when the CLI fails or prints nothing', async () => {
		vi.stubEnv('SHELL', await fakeShell('fails', "printf 'not-a-token' >&3\nexit 1"))
		expect(await resolveGithubToken()).toBeUndefined()
		vi.stubEnv('SHELL', await fakeShell('silent', 'exit 0'))
		expect(await resolveGithubToken()).toBeUndefined()
	})
})
