import { getEricProjects } from '#lib/server/project.js'

const projects = await getEricProjects()

const reallyMyProjects = projects.filter((project) => project.isAuthoredByMe)

const dependencyFrequency = new Map<string, number>()

for (const project of reallyMyProjects) {
	const dependencyNames = Object.keys(project.package.dependencies ?? {})
	const devDependencyNames = Object.keys(project.package.devDependencies ?? {})

	const allDependencyNames = [...dependencyNames, ...devDependencyNames].filter(
		(dependencyName) =>
			!dependencyName.startsWith('@types/') && !dependencyName.startsWith('@kitschpatrol/'),
	)

	for (const dependencyName of allDependencyNames) {
		if (dependencyFrequency.has(dependencyName)) {
			dependencyFrequency.set(dependencyName, dependencyFrequency.get(dependencyName)! + 1)
		} else {
			dependencyFrequency.set(dependencyName, 1)
		}
	}
}

// Sort the dependencies by frequency
const sortedDependencyFrequency = [...dependencyFrequency].sort((a, b) => b[1] - a[1])

for (const [dependencyName, frequency] of sortedDependencyFrequency) {
	console.log(`${dependencyName}: ${frequency}`)
}
