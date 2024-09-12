import { getProjectPaths } from '$lib/server/project'
import type { PageServerLoad } from './$types'

// eslint-disable-next-line @typescript-eslint/naming-convention
export const load: PageServerLoad = async () => {
	console.log('load page')

	const projectPaths = await getProjectPaths(
		'/Users/mika/Code/',
		// Any extra repos not detected by getProjectPaths filters...
		[],
	)

	return {
		projectPaths,
	}
}
