import { cspellConfig } from '@kitschpatrol/cspell-config'

export default cspellConfig({
	// Case Police also reads these paths when fixing capitalization.
	ignorePaths: ['build', 'out'],
	words: ['gita', 'httpx', 'objectname', 'slopforest', 'togglefullscreen'],
})
