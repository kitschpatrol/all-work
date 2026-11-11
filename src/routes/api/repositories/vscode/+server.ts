import { openRepositoriesInVsCode } from '#lib/server/open-repository.js'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, url }) =>
	openRepositoriesInVsCode(request, url)
