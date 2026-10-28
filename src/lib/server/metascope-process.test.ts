import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { extractMetadata } from './metascope-process.js'

let directory: string
beforeAll(async () => {
	directory = await mkdtemp(path.join(os.tmpdir(), 'all-work-isolation-'))
	await writeFile(
		path.join(directory, 'README.md'),
		'# Heavy fixture\n\n' +
			'- A [link](https://example.com) with **bold text** and `code`.\n'.repeat(30_000),
	)
})
afterAll(async () => {
	await rm(directory, { force: true, recursive: true })
})

describe('isolated Metascope scans', () => {
	it('keeps the parent event loop responsive while parsing a large README', async () => {
		let last = performance.now()
		let maximumGap = 0
		const timer = setInterval(() => {
			const now = performance.now()
			maximumGap = Math.max(maximumGap, now - last)
			last = now
		}, 10)
		const controller = new AbortController()
		try {
			const result = await extractMetadata(
				{
					offline: true,
					path: directory,
					recursive: false,
					sources: ['readmeFile'],
					workspaces: false,
				},
				controller.signal,
			)
			maximumGap = Math.max(maximumGap, performance.now() - last)
			expect(JSON.stringify(result)).toContain('Heavy fixture')
			expect(maximumGap).toBeLessThan(250)
		} finally {
			clearInterval(timer)
			controller.abort()
		}
	}, 15_000)

	it('cancels a running scan without waiting for extraction to finish', async () => {
		const controller = new AbortController()
		const result = extractMetadata(
			{ offline: true, path: directory, sources: ['readmeFile'] },
			controller.signal,
		)
		const timer = setTimeout(() => controller.abort(), 50)
		try {
			await expect(result).rejects.toThrow('Metadata scanner stopped before completing.')
		} finally {
			clearTimeout(timer)
			controller.abort()
		}
	}, 5000)
})
