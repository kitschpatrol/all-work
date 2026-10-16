import { readdir, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const metadataCacheFile = /^[a-f\d]{64}\.json$/iv

/** Keep larger local caches outside browser storage. */
export function cacheDirectory(kind: 'metadata' | 'runs') {
	const override = process.env.ALLWORK_CACHE_DIRECTORY
	return override === undefined
		? path.join(
				os.homedir(),
				process.platform === 'darwin' ? 'Library/Caches/AllWork' : '.cache/allwork',
				kind,
			)
		: kind === 'metadata'
			? override
			: path.join(override, 'runs')
}

/**
 * Remove only metadata cache records, leaving running jobs and unrelated files
 * intact.
 */
export async function clearMetadataCache() {
	let count = 0
	try {
		const entries = await readdir(cacheDirectory('metadata'), { withFileTypes: true })
		for (const entry of entries) {
			if (!entry.isFile() || !metadataCacheFile.test(entry.name)) {
				continue
			}

			await unlink(path.join(cacheDirectory('metadata'), entry.name))
			count++
		}
	} catch (error) {
		if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
			throw error
		}
	}

	return count
}
