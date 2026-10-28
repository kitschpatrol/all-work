import { error } from '@sveltejs/kit'

/**
 * Restrict local filesystem and shell actions to deliberate same-origin app
 * requests.
 */
export async function readRequest(
	request: Request,
	url: URL,
	maxBytes = 64_000,
): Promise<Record<string, unknown>> {
	if (
		!['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) ||
		request.headers.get('x-all-work-request') !== '1' ||
		(request.headers.has('origin') && request.headers.get('origin') !== url.origin)
	) {
		error(403, 'This action must be requested from All Work.')
	}

	if (Number(request.headers.get('content-length') ?? 0) > maxBytes) {
		error(413, 'Request too large.')
	}

	try {
		const body: unknown = await request.json()
		if (typeof body !== 'object' || body === null || Array.isArray(body)) {
			error(400, 'Invalid request.')
		}

		return body as Record<string, unknown>
	} catch {
		error(400, 'Expected a JSON request.')
	}
}
