import { getEricProjects } from '#lib/server/project.js'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async () => {
	const projects = await getEricProjects()

	// Type ProjectProjectMetadata = Awaited<ReturnType<typeof Project.prototype.getProjectMetadata>>

	// Const resolvedProjects: ProjectProjectMetadata[] = []

	// For (const project of projects) {
	// 	const resolveProject = await project.getProjectMetadata()
	// 	resolvedProjects.push(resolveProject)
	// }

	// Can't pass non-POJO class : (
	return {
		projects: projects.map(async (project) => project.getProjectMetadata()),
	}
}
