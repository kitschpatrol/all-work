import { listReadmeApps } from '#lib/server/open-repository.js'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, url }) => listReadmeApps(request, url)
