import { getProjectPaths, loadProject, Project } from '$lib/server/project'
import type { PageServerLoad } from './$types'

// eslint-disable-next-line @typescript-eslint/naming-convention
export const load: PageServerLoad = async () => {
	console.log('load page')

	const projectPaths = await getProjectPaths(
		'/Users/mika/Code/',
		// Any extra repos not detected by getProjectPaths filters...
		[],
	)

	const projects = projectPaths.map((projectPath) => new Project(projectPath))
	const activeProjects = projects.filter((project) => project.status !== 'unmaintained')

	return {
		projects: activeProjects.map((projectPath) => loadProject(projectPath)),
	}
}
