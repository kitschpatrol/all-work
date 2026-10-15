import { describe, expect, it } from 'vitest'
import { completeColumnVariable, getColumnCompletion } from './command-completion.js'

describe('command column completion', () => {
	it('recognizes a dollar trigger and a partial variable at the cursor', () => {
		expect(getColumnCompletion('echo $', 6)).toEqual({ braced: false, end: 6, query: '', start: 5 })
		const value = 'echo $ALLWORK_COLUMN_VER'
		expect(getColumnCompletion(value, value.length)?.query).toBe('ALLWORK_COLUMN_VER')
	})

	it('ignores escaped dollars, process IDs, command substitutions, and text selections', () => {
		for (const value of [String.raw`echo \$`, 'echo $$', 'echo $(', 'echo $1']) {
			expect(getColumnCompletion(value, value.length)).toBeUndefined()
		}

		expect(getColumnCompletion('echo $VER', 6, 9)).toBeUndefined()
		expect(getColumnCompletion(String.raw`echo \\$`, 8)).toBeDefined()
	})

	it('preserves quotes and the text after the variable', () => {
		const value = 'echo "$VER" && pwd'
		const token = getColumnCompletion(value, 10)
		expect(token).toBeDefined()
		if (token === undefined) {
			throw new Error('Missing variable completion')
		}

		expect(completeColumnVariable(value, token, 'ALLWORK_COLUMN_VERSION')).toEqual({
			caret: 29,
			value: 'echo "$ALLWORK_COLUMN_VERSION" && pwd',
		})
	})

	it('replaces the whole token when completing in the middle of a variable', () => {
		const value = 'echo $VER_old tail'
		const token = getColumnCompletion(value, 9)
		expect(token).toBeDefined()
		if (token === undefined) {
			throw new Error('Missing variable completion')
		}

		expect(completeColumnVariable(value, token, 'ALLWORK_COLUMN_VERSION').value).toBe(
			'echo $ALLWORK_COLUMN_VERSION tail',
		)
	})

	it('completes braced variables without duplicating their closing brace', () => {
		for (const value of [`echo \${VER}`, 'echo ${VER']) {
			const token = getColumnCompletion(value, 10)
			expect(token).toBeDefined()
			if (token === undefined) {
				throw new Error('Missing variable completion')
			}

			expect(completeColumnVariable(value, token, 'ALLWORK_COLUMN_VERSION').value).toBe(
				`echo \${ALLWORK_COLUMN_VERSION}`,
			)
		}
	})
})
