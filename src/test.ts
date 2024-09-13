import * as ncu from 'npm-check-updates'

const results = await ncu.run({
	cache: true,
	cwd: '/Users/mika/Code/svelteasdfasdf-tweakpane-ui',
	pre: false,
	target: 'greatest',
	upgrade: false,
	workspaces: true,
})

const updateSet = new Set<string>()
for (const value of Object.values(results)) {
	for (const [key2, value2] of Object.entries(value)) {
		updateSet.add(`${key2}: ${value2}`)
	}
}

const updateArray = [...updateSet]

console.log('----------------------------------')
console.log(updateArray)
