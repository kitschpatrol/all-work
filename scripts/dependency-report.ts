import { scanWorkspace } from '#lib/server/repositories.js'
import { getMetadata, helpers } from 'metascope'

const workspace = await scanWorkspace(process.argv[2] ?? '.')

const dependencyFrequency = new Map<string, number>()

for (const project of workspace.repositories) {
	const metadata = await getMetadata({
		offline: true,
		path: project.path,
		sources: ['nodePackageJson'],
		workspaces: false,
	})
	const pkg = helpers.firstOf(metadata.nodePackageJson)?.data
	const dependencyNames = Object.keys(pkg?.dependencies ?? {})
	const devDependencyNames = Object.keys(pkg?.devDependencies ?? {})

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
const sortedDependencyFrequency = [...dependencyFrequency].toSorted((a, b) => b[1] - a[1])

for (const [dependencyName, frequency] of sortedDependencyFrequency) {
	console.log(`${dependencyName}: ${frequency}`)
}
