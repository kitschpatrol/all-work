import { openRepository } from '#lib/server/open-repository.js'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, url }) =>
	openRepository(request, url, 'Tower')
