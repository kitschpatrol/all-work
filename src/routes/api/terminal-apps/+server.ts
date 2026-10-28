import { listTerminalApps } from '#lib/server/open-repository.js'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, url }) => listTerminalApps(request, url)
