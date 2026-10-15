import path from 'node:path'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = () => ({
	defaultDirectory: process.env.ALLWORK_DIRECTORY ?? path.dirname(process.cwd()),
})
