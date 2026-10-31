import { describe, expect, it } from 'vitest'
import type { MenuState } from './electron-api.js'
import { resolveColumnPresets } from './column-presets.js'
import {
	isColumnMenuRequest,
	isHiddenColumnsMenuRequest,
	isMenuState,
	isRepositoryMenuChoice,
	isRepositoryMenuRequest,
} from './electron-api.js'
import { filterPresets } from './filter-presets.js'

describe('menu requests arriving over IPC', () => {
	it('accepts built-in menus alongside 100 saved presets and rejects oversized lists', () => {
		const saved = Array.from({ length: 100 }, (_, index) => ({
			id: `custom:${index}` as const,
			label: `Preset ${index}`,
		}))
		const state: MenuState = {
			autoClear: false,
			canReload: false,
			canRun: false,
			columnPreset: 'none',
			columnPresets: [...resolveColumnPresets([], []), ...saved],
			filterActive: false,
			filterPreset: undefined,
			filterPresets: [...filterPresets, ...saved],
			hasActiveRuns: false,
			hasFinishedRuns: false,
			loading: false,
			selectedCount: 0,
			selectedOnly: false,
			showRepositoryShortcuts: false,
			visibleCount: 0,
		}
		expect(isMenuState(state)).toBe(true)
		const extra = { id: 'custom:overflow', label: 'Overflow' }
		expect(isMenuState({ ...state, columnPresets: [...state.columnPresets, extra] })).toBe(false)
		expect(isMenuState({ ...state, filterPresets: [...state.filterPresets, extra] })).toBe(false)
	})

	it('accepts a column menu request only when it says whether the column has a variable', () => {
		const request = {
			canDock: true,
			canFilter: true,
			canHide: true,
			canSort: true,
			columnId: 'branch',
			dock: undefined,
			hasFinishedRunsLeft: false,
			hasFinishedRunsRight: true,
			hasSelection: false,
			hasVariable: true,
			isRun: true,
		}
		expect(isColumnMenuRequest(request)).toBe(true)
		expect(isColumnMenuRequest({ ...request, isRun: undefined })).toBe(false)
		expect(isColumnMenuRequest({ ...request, hasFinishedRunsLeft: 1 })).toBe(false)
		expect(isColumnMenuRequest({ ...request, hasVariable: undefined })).toBe(false)
		expect(isColumnMenuRequest({ ...request, hasVariable: 'true' })).toBe(false)
		expect(isColumnMenuRequest({ ...request, dock: 'start' })).toBe(true)
		expect(isColumnMenuRequest({ ...request, dock: 'left' })).toBe(false)
		expect(isColumnMenuRequest({ ...request, canDock: undefined })).toBe(false)
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

	it('accepts a repository menu request with all availability flags', () => {
		const request = { hasGithubRemote: true, hasReadme: false, hasWebsite: true }
		expect(isRepositoryMenuRequest(request)).toBe(true)
		for (const invalid of [
			true,
			undefined,
			[],
			{ hasGithubRemote: true },
			{ hasReadme: 1 },
			{ ...request, hasWebsite: undefined },
			{ ...request, hasWebsite: 'true' },
		]) {
			expect(isRepositoryMenuRequest(invalid)).toBe(false)
		}
	})

	it('narrows repository menu choices to open targets, copy path, and refresh', () => {
		for (const choice of [
			'copyPath',
			'readme',
			'refresh',
			'finder',
			'github',
			'terminal',
			'tower',
			'vscode',
			'website',
		]) {
			expect(isRepositoryMenuChoice(choice)).toBe(true)
		}

		for (const choice of ['Readme', 'copy', '', undefined]) {
			expect(isRepositoryMenuChoice(choice)).toBe(false)
		}
	})
})
