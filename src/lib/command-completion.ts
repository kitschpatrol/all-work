export type ColumnCompletion = {
	braced: boolean
	end: number
	query: string
	start: number
}

const variablePattern = /\$(\{?)([a-z_]\w*)?$/iv
const backslashPattern = /\\+$/v
const suffixPattern = /^\w*/v

/** Find the shell variable being edited at the command cursor. */
export function getColumnCompletion(value: string, start: number, end = start) {
	if (start !== end) {
		return
	}

	const match = variablePattern.exec(value.slice(0, start))
	if (match === null || value[match.index - 1] === '$') {
		return
	}

	const backslashes = backslashPattern.exec(value.slice(0, match.index))?.[0].length ?? 0
	if (backslashes % 2 !== 0) {
		return
	}

	const braced = match[1] === '{'
	const suffixLength = suffixPattern.exec(value.slice(start))?.[0].length ?? 0
	const tokenEnd = start + suffixLength
	return {
		braced,
		end: tokenEnd + (braced && value[tokenEnd] === '}' ? 1 : 0),
		query: match[2] ?? '',
		start: match.index,
	}
}

/** Replace a variable token without changing the user's surrounding quotes. */
export function completeColumnVariable(value: string, token: ColumnCompletion, name: string) {
	const insertion = token.braced ? `\${${name}}` : `$${name}`
	return {
		caret: token.start + insertion.length,
		value: value.slice(0, token.start) + insertion + value.slice(token.end),
	}
}
