import { clearMetadataCache } from '#lib/server/cache.js'
import { readRequest } from '#lib/server/request.js'
import type { RequestHandler } from './$types'

export const DELETE: RequestHandler = async ({ request, url }) => {
	await readRequest(request, url)
	return Response.json({ cleared: await clearMetadataCache() })
}
