import { getEricProjects } from '$lib/server/project'

const projects = await getEricProjects()

const reallyMyProjects = projects.filter((project) => project.isAuthoredByMe)

const depFrequency = new Map<string, number>()

for (const project of reallyMyProjects) {
	const depNames = Object.keys(project.package.dependencies ?? {})
	const devDepNames = Object.keys(project.package.devDependencies ?? {})

	const allDepNames = [...depNames, ...devDepNames].filter(
		(depName) => !(depName.startsWith('@types/') || depName.startsWith('@kitschpatrol/')),
	)

	for (const depName of allDepNames) {
		if (depFrequency.has(depName)) {
			depFrequency.set(depName, depFrequency.get(depName)! + 1)
		} else {
			depFrequency.set(depName, 1)
		}
	}
}

// Sort the dependencies by frequency
const sortedDepFrequency = [...depFrequency.entries()].sort((a, b) => b[1] - a[1])

for (const [depName, frequency] of sortedDepFrequency) {
	console.log(`${depName}: ${frequency}`)
}
