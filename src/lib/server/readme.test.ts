import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findReadme } from './readme.js'

let directory: string

async function readmeAmong(files: string[], directories: string[] = []) {
	for (const name of directories) {
		await mkdir(path.join(directory, name))
	}

	for (const name of files) {
		await writeFile(path.join(directory, name), '# Fixture\n')
	}

	return findReadme(await readdir(directory, { withFileTypes: true }))
}

beforeEach(async () => {
	directory = await mkdtemp(path.join(os.tmpdir(), 'allwork-readme-'))
})

afterEach(async () => {
	await rm(directory, { force: true, recursive: true })
})

describe('finding a repository readme', () => {
	it.each([
		[['README.txt', 'readme.md'], 'readme.md'],
		[['README', 'readme.rst', 'Readme.markdown'], 'Readme.markdown'],
		[['readme.txt', 'readme'], 'readme'],
		[['readme.txt', 'package.json'], 'readme.txt'],
	])('chooses Markdown first among %j', async (files, expected) => {
		await expect(readmeAmong(files)).resolves.toBe(expected)
	})

	it('ignores localized, suffixed, and unrelated files', async () => {
		await expect(
			readmeAmong(['readme.ja.md', 'readme-old.md', 'docs.md', 'about-readme.md']),
		).resolves.toBe('')
	})

	it('ignores a readme directory or symlink so the opened file stays in the repository', async () => {
		const outside = path.join(os.tmpdir(), 'outside-readme.md')
		await symlink(outside, path.join(directory, 'readme.md'))
		await expect(readmeAmong([], ['README'])).resolves.toBe('')
	})

	it('reports no readme for an empty repository root', async () => {
		await expect(readmeAmong([])).resolves.toBe('')
	})
})
