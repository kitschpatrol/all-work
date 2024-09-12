import { getProjectPaths, Project } from '$lib/server/project'
import type { PageServerLoad } from './$types'

// eslint-disable-next-line @typescript-eslint/naming-convention
export const load: PageServerLoad = async () => {
	const projectPaths = await getProjectPaths(
		'/Users/mika/Code/',
		// Any extra repos not detected by getProjectPaths filters...
		[],
	)

	const projects = projectPaths
		.map((projectPath) => new Project(projectPath))
		.filter((project) => project.status !== 'unmaintained')

	// Type ProjectTableRow = Awaited<ReturnType<typeof Project.prototype.getTableRow>>

	// Const resolvedProjects: ProjectTableRow[] = []

	// For (const project of projects) {
	// 	const resolveProject = await project.getTableRow()
	// 	resolvedProjects.push(resolveProject)
	// }

	// Can't pass non-POJO class : (
	return {
		projects: projects.map(async (project) => project.getTableRow()),
	}
}
