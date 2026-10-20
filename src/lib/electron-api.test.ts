import { describe, expect, it } from 'vitest'
import {
	isColumnMenuRequest,
	isHiddenColumnsMenuRequest,
	isRepositoryMenuChoice,
	isRepositoryMenuRequest,
} from './electron-api.js'

describe('menu requests arriving over IPC', () => {
	it('accepts a column menu request only when it says whether the column has a variable', () => {
		const request = {
			canFilter: true,
			canHide: true,
			canSort: true,
			columnId: 'branch',
			hasSelection: false,
			hasVariable: true,
		}
		expect(isColumnMenuRequest(request)).toBe(true)
		expect(isColumnMenuRequest({ ...request, hasVariable: undefined })).toBe(false)
		expect(isColumnMenuRequest({ ...request, hasVariable: 'true' })).toBe(false)
	})

	it('accepts hidden columns grouped under a category, and an empty list', () => {
		const request = {
			groups: [{ category: 'Git', columns: [{ id: 'sync', label: 'Sync' }] }],
		}
		expect(isHiddenColumnsMenuRequest(request)).toBe(true)
		expect(isHiddenColumnsMenuRequest({ groups: [] })).toBe(true)
		for (const invalid of [
			undefined,
			[],
			{ groups: {} },
			{ groups: [{ category: '', columns: [{ id: 'sync', label: 'Sync' }] }] },
			{ groups: [{ category: 'Git', columns: [] }] },
			{ groups: [{ category: 'Git', columns: [{ id: 'sync' }] }] },
			{ groups: [{ category: 'Git', columns: [{ id: '', label: 'Sync' }] }] },
			{ groups: [{ category: 'Git', columns: ['sync'] }] },
		]) {
			expect(isHiddenColumnsMenuRequest(invalid)).toBe(false)
		}
	})

	it('accepts a repository menu request with both availability flags', () => {
		expect(isRepositoryMenuRequest({ hasGithubRemote: true, hasReadme: false })).toBe(true)
		for (const request of [true, undefined, [], { hasGithubRemote: true }, { hasReadme: 1 }]) {
			expect(isRepositoryMenuRequest(request)).toBe(false)
		}
	})

	it('narrows repository menu choices to open targets and refresh', () => {
		for (const choice of ['readme', 'refresh', 'finder', 'github', 'terminal', 'tower', 'vscode']) {
			expect(isRepositoryMenuChoice(choice)).toBe(true)
		}

		for (const choice of ['Readme', 'copy', '', undefined]) {
			expect(isRepositoryMenuChoice(choice)).toBe(false)
		}
	})
})
