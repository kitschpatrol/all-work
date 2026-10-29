import { describe, expect, it } from 'vitest'
import { nextCustomName } from './preset-name.js'

describe('nextCustomName', () => {
	it('starts at Custom 1', () => {
		expect(nextCustomName([])).toBe('Custom 1')
		expect(nextCustomName(['Default', 'All', 'Ahead'])).toBe('Custom 1')
	})

	it('skips names already in use regardless of case and spacing', () => {
		expect(nextCustomName(['Custom 1', ' custom 2 ', 'Custom 4'])).toBe('Custom 3')
	})
})
