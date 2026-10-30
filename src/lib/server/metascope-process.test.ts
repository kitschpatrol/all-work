import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { extractMetadata, stopMetadataWorkers } from './metascope-process.js'

const missingPath = /missing/v
let directory: string
beforeAll(async () => {
	directory = await mkdtemp(path.join(os.tmpdir(), 'all-work-isolation-'))
	await writeFile(
		path.join(directory, 'README.md'),
		'# Heavy fixture\n\n' +
			'- A [link](https://example.com) with **bold text** and `code`.\n'.repeat(15_000),
	)
})
afterAll(async () => {
	stopMetadataWorkers()
	await rm(directory, { force: true, recursive: true })
})

const readme = { offline: true, path: '', recursive: false, sources: ['readmeFile' as const] }

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

	it('runs more extractions than scanner processes, in parallel', async () => {
		const results = await Promise.all(
			Array.from({ length: 6 }, async () => extractMetadata({ ...readme, path: directory })),
		)
		for (const result of results) {
			expect(JSON.stringify(result)).toContain('Heavy fixture')
		}
	}, 60_000)

	it('extracts again after cancelling a running extraction', async () => {
		const controller = new AbortController()
		const cancelled = extractMetadata({ ...readme, path: directory }, controller.signal)
		setTimeout(() => controller.abort(), 50)
		await expect(cancelled).rejects.toThrow('Metadata scanner stopped before completing.')
		expect(JSON.stringify(await extractMetadata({ ...readme, path: directory }))).toContain(
			'Heavy fixture',
		)
	}, 120_000)

	it('cancels a queued extraction without disturbing the running ones', async () => {
		const controller = new AbortController()
		const running = Array.from({ length: 4 }, async () =>
			extractMetadata({ ...readme, path: directory }),
		)
		const queued = extractMetadata({ ...readme, path: directory }, controller.signal)
		controller.abort()
		await expect(queued).rejects.toThrow('Metadata scanner stopped before completing.')
		const results = await Promise.all(running)
		for (const result of results) {
			expect(JSON.stringify(result)).toContain('Heavy fixture')
		}
	}, 60_000)

	it('rejects right away when already cancelled', async () => {
		await expect(
			extractMetadata({ ...readme, path: directory }, AbortSignal.abort()),
		).rejects.toThrow('Metadata scanner stopped before completing.')
	})

	it('reports extraction errors from the scanner', async () => {
		await expect(
			extractMetadata({ ...readme, path: path.join(directory, 'missing') }),
		).rejects.toThrow(missingPath)
	}, 60_000)
})
