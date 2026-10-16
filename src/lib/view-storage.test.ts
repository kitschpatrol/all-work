import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultPreferences } from './preferences.js'
import {
	createViewWriter,
	loadLocalState,
	parseSavedView,
	savePreferences,
} from './view-storage.js'

function storageFixture() {
	const values = new Map<string, string>()
	return {
		getItem: vi.fn<Window['localStorage']['getItem']>(
			(key) =>
				values.get(key) ?? (JSON.parse('null') as ReturnType<Window['localStorage']['getItem']>),
		),
		removeItem: vi.fn((key: string) => {
			values.delete(key)
		}),
		setItem: vi.fn((key: string, value: string) => {
			values.set(key, value)
		}),
	}
}

afterEach(() => {
	vi.useRealTimers()
})

describe('local view persistence', () => {
	it('migrates existing toolbar settings and history without auto-opening an unsaved workspace', () => {
		const storage = storageFixture()
		storage.setItem('allwork.directory', '/projects')
		storage.setItem('allwork.outputLines', '5')
		storage.setItem('allwork.commandHistory', '["pwd"]')
		storage.setItem('allwork.recursive', 'false')
		expect(loadLocalState(storage, '/default').view).toMatchObject({
			commandHistory: ['pwd'],
			directory: '/projects',
			outputLines: 5,
			recursive: false,
			workspaceDirectory: undefined,
		})
	})

	it('round-trips table geometry, selection, sorting, scroll and runs while debouncing writes', () => {
		vi.useFakeTimers()
		const storage = storageFixture()
		const onError = vi.fn<() => void>()
		const writer = createViewWriter(storage, onError)
		const view = parseSavedView(
			{
				autoClear: true,
				columnSizing: { name: 123 },
				columnVisibility: { description: false },
				command: 'printf draft',
				commandHistory: ['pwd'],
				concurrency: 9,
				directory: '/draft',
				outputLines: 4,
				recursive: false,
				resizedColumns: ['name'],
				rowSelection: { fixture: true },
				runIds: ['run-1'],
				scroll: { left: 40, top: 80 },
				search: 'fixture',
				selectedOnly: true,
				sorting: [{ desc: true, id: 'run-1' }],
				status: 'dirty',
				workspaceDirectory: '/projects',
			},
			'/default',
		)
		writer.queue(parseSavedView(undefined, '/default'))
		writer.queue(view)
		expect(storage.setItem).not.toHaveBeenCalled()
		vi.advanceTimersByTime(200)
		expect(storage.setItem).toHaveBeenCalledTimes(1)
		expect(loadLocalState(storage, '/default').view).toEqual(view)
		writer.queue({ ...view, command: 'latest draft' })
		writer.flush()
		expect(loadLocalState(storage, '/default').view.command).toBe('latest draft')
		expect(onError).not.toHaveBeenCalled()
	})

	it('rejects corrupt sizes and controls, and recovers from malformed JSON', () => {
		const storage = storageFixture()
		storage.setItem('allwork.view.v1', '{broken')
		expect(loadLocalState(storage, '/default').view.directory).toBe('/default')
		expect(
			parseSavedView(
				{
					columnSizing: { huge: 5000, negative: -1, valid: 120 },
					concurrency: 100,
					outputLines: 0,
					rowSelection: { invalid: 1, valid: true },
					scroll: { left: -5, top: 20 },
					sorting: [42, { desc: true, id: 'name' }],
				},
				'/default',
			),
		).toMatchObject({
			columnSizing: { valid: 120 },
			concurrency: 6,
			outputLines: 3,
			rowSelection: { valid: true },
			scroll: { left: 0, top: 20 },
			sorting: [{ desc: true, id: 'name' }],
		})
	})

	it('keeps identity when resetting the view and removes migrated keys', () => {
		const storage = storageFixture()
		const preferences = {
			...defaultPreferences(),
			identity: { authorNames: ['Fixture'], githubAccounts: ['fixture'] },
		}
		savePreferences(storage, preferences)
		storage.setItem('allwork.directory', '/old')
		const writer = createViewWriter(storage, vi.fn<() => void>())
		writer.queue(parseSavedView({ command: 'discard' }, '/old'))
		writer.reset()
		writer.flush()
		expect(loadLocalState(storage, '/default')).toMatchObject({
			preferences,
			view: { command: '', directory: '/default' },
		})
	})

	it('reports unavailable storage without throwing from a background save', () => {
		vi.useFakeTimers()
		const storage = storageFixture()
		storage.setItem.mockImplementation(() => {
			throw new Error('Quota exceeded')
		})
		const onError = vi.fn<() => void>()
		const writer = createViewWriter(storage, onError)
		writer.queue(parseSavedView(undefined, '/default'))
		vi.advanceTimersByTime(200)
		expect(onError).toHaveBeenCalledOnce()
		storage.setItem.mockReset()
		writer.flush()
		expect(storage.setItem).toHaveBeenCalledOnce()
	})
})
