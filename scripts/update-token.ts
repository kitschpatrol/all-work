import { getEricProjects } from '$lib/server/project'

const projects = await getEricProjects()
const myProjects = projects.filter((project) => project.isAuthoredByMe)

console.log(projects.length)
console.log(myProjects.length)

// For (const project of projects) {
// 	console.log(project)
// 	console.log('----------------------------------')
// }
