import { getProjectPaths, Project } from '$lib/server/project'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async () => {
	const projectPaths = await getProjectPaths(
		'/Users/mika/Code/',
		// Any extra repos not detected by getProjectPaths filters...
		[
			'/Users/mika/Notes',
			'/opt/homebrew/Library/Taps/kitschpatrol/homebrew-stuff',
			'/Users/mika/.local/share/chezmoi',
		],
		// Exclusions
		[
			'/Users/mika/Code/eleventy-plugin-syntaxhighlight',
			'/Users/mika/Code/parcel-optimizer-friendly-urls',
			'/Users/mika/Code/eleventy-plugin-parcel-test',
			'/Users/mika/Code/tp-test-astro',
		],
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
