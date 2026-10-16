import path from 'node:path'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = ({ request }) => ({
	defaultDirectory: process.env.ALLWORK_DIRECTORY ?? path.dirname(process.cwd()),
	// Electron hides chrome the application menu already covers; detect it
	// server-side so the layout never flashes between the two
	isElectron: request.headers.get('user-agent')?.includes('Electron/') ?? false,
})
