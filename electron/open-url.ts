import { shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { parseExternalUrl } from '../src/lib/external-links.js'

/** Open a link with its system handler, decoding file URLs to local paths. */
export async function openExternalUrl(value: unknown): Promise<void> {
	const url = parseExternalUrl(value)
	if (url === undefined) {
		throw new TypeError('Invalid external URL.')
	}

	if (url.protocol === 'file:') {
		const message = await shell.openPath(fileURLToPath(url))
		if (message !== '') {
			throw new Error(message)
		}
	} else {
		await shell.openExternal(url.href)
	}
}
