import { getEricProjects } from '$lib/server/project'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async () => {
	const projects = await getEricProjects()

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
