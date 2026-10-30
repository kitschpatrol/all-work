const externalUrl = /^(?:[a-z][a-z\d+.\-]*:\/\/|mailto:)/iv
const internalProtocols = new Set([
	'about:',
	'blob:',
	'chrome-extension:',
	'chrome:',
	'data:',
	'devtools:',
	// eslint-disable-next-line no-script-url -- This protocol is rejected, never opened.
	'javascript:',
	'vbscript:',
])

/** Recognize absolute web, file, email, and application URLs in cell values. */
export function parseExternalUrl(value: unknown): undefined | URL {
	if (typeof value !== 'string' || !externalUrl.test(value.trim())) {
		return undefined
	}

	try {
		const url = new URL(value.trim())
		return internalProtocols.has(url.protocol) ? undefined : url
	} catch {
		return undefined
	}
}
