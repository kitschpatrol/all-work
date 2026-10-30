import { afterEach, describe, expect, it, vi } from 'vitest'
import { request } from './client-request.js'
import { defaultPreferences } from './preferences.js'
import { createViewWriter, loadSettings, parseSavedView, savePreferences } from './view-storage.js'

vi.mock('./client-request.js', () => ({ request: vi.fn() }))

afterEach(() => {
	vi.useRealTimers()
	vi.mocked(request).mockReset()
})

describe('shared JSON view persistence', () => {
	it('restores the preset source of an edited filter and ignores invalid preset IDs', () => {
		expect(parseSavedView({ filterPreset: 'custom:fixture' }, '/projects').filterPreset).toBe(
			'custom:fixture',
		)
		expect(parseSavedView({ filterPreset: 'changed' }, '/projects').filterPreset).toBe('changed')
		expect(parseSavedView({ filterPreset: 'broken' }, '/projects').filterPreset).toBeUndefined()
		expect(parseSavedView(undefined, '/projects').filterPreset).toBeUndefined()
	})

	it('restores the column preset being shown and ignores invalid preset IDs', () => {
		expect(parseSavedView({ columnPreset: 'defaults' }, '/projects').columnPreset).toBe('defaults')
		expect(parseSavedView({ columnPreset: 'custom:fixture' }, '/projects').columnPreset).toBe(
			'custom:fixture',
		)
		expect(parseSavedView({ columnPreset: 'changed' }, '/projects').columnPreset).toBeUndefined()
		expect(parseSavedView(undefined, '/projects').columnPreset).toBe('defaults')
	})

	it('discovers repositories non-recursively unless the saved view enables it', () => {
		expect(parseSavedView(undefined, '/projects').recursive).toBe(false)
		expect(parseSavedView({ recursive: 'true' }, '/projects').recursive).toBe(false)
		expect(parseSavedView({ recursive: true }, '/projects').recursive).toBe(true)
	})

	it('loads identity and view data from the server without accessing browser storage', async () => {
		const preferences = {
			...defaultPreferences(),
			identity: { authorNames: ['Fixture'], githubAccounts: ['fixture'] },
		}
		vi.mocked(request).mockResolvedValue({
			preferences,
			view: { commandHistory: ['pwd'], directory: '/projects', outputLines: 5, recursive: false },
		})
		expect(await loadSettings('/default')).toMatchObject({
			preferences,
			view: { commandHistory: ['pwd'], directory: '/projects', outputLines: 5, recursive: false },
		})
		expect(request).toHaveBeenCalledWith('/api/settings', {})
		await savePreferences(preferences)
		expect(request).toHaveBeenLastCalledWith(
			'/api/settings',
			{ kind: 'preferences', value: preferences },
			'PUT',
		)
	})

	it('debounces snapshots, flushes the latest draft on close, and orders requests', async () => {
		vi.useFakeTimers()
		vi.mocked(request).mockResolvedValue({ saved: true })
		const onError = vi.fn<() => void>()
		const writer = createViewWriter(onError)
		const view = parseSavedView(
			{
				columnSizing: { name: 123 },
				rowSelection: { fixture: true },
				scroll: { left: 40, top: 80 },
				sorting: [{ desc: true, id: 'name' }],
			},
			'/projects',
		)
		writer.queue(parseSavedView(undefined, '/default'))
		writer.queue(view)
		expect(request).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(200)
		expect(request).toHaveBeenCalledOnce()
		expect(request).toHaveBeenLastCalledWith(
			'/api/settings',
			{ kind: 'view', value: view, writer: { id: expect.any(String) as unknown, sequence: 1 } },
			'PUT',
			{ keepalive: false },
		)
		writer.queue({ ...view, command: 'latest draft' })
		await writer.flush(true)
		expect(request).toHaveBeenLastCalledWith(
			'/api/settings',
			{
				kind: 'view',
				value: { ...view, command: 'latest draft' },
				writer: { id: expect.any(String) as unknown, sequence: 2 },
			},
			'PUT',
			{ keepalive: true },
		)
		expect(onError).not.toHaveBeenCalled()
	})

	it('sanitizes corrupt sizes and controls while retaining valid table state', () => {
		expect(
			parseSavedView(
				{
					columnOrder: ['version', 7, 'name'],
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
			columnOrder: ['version', 'name'],
			columnSizing: { valid: 120 },
			concurrency: 6,
			outputLines: 3,
			rowSelection: { valid: true },
			scroll: { left: 0, top: 20 },
			sorting: [{ desc: true, id: 'name' }],
		})
	})

	it('discards queued snapshots on reset and prevents them from resurrecting the old view', async () => {
		vi.useFakeTimers()
		vi.mocked(request).mockResolvedValue({ reset: true })
		const writer = createViewWriter(vi.fn<() => void>())
		writer.queue(parseSavedView({ command: 'discard' }, '/old'))
		await writer.reset()
		await vi.runAllTimersAsync()
		expect(request).toHaveBeenCalledOnce()
		expect(request).toHaveBeenLastCalledWith(
			'/api/settings',
			{ kind: 'view', writer: { id: expect.any(String) as unknown, sequence: 1 } },
			'DELETE',
		)
	})

	it('waits for in-flight saves before resetting and ignores snapshots queued during reset', async () => {
		vi.useFakeTimers()
		const deferred = Promise.withResolvers<unknown>()
		vi.mocked(request).mockReturnValueOnce(deferred.promise).mockResolvedValue({ reset: true })
		const writer = createViewWriter(vi.fn<() => void>())
		writer.queue(parseSavedView({ command: 'old' }, '/projects'))
		const saving = writer.flush()
		const resetting = writer.reset()
		writer.queue(parseSavedView({ command: 'discard during reset' }, '/projects'))
		expect(request).toHaveBeenCalledOnce()
		deferred.resolve({ saved: true })
		await Promise.all([saving, resetting])
		await vi.runAllTimersAsync()
		expect(request).toHaveBeenCalledTimes(2)
		expect(request).toHaveBeenLastCalledWith(
			'/api/settings',
			{ kind: 'view', writer: { id: expect.any(String) as unknown, sequence: 2 } },
			'DELETE',
		)
	})

	it('reports failed disk saves without leaving an unhandled background rejection', async () => {
		vi.useFakeTimers()
		vi.mocked(request).mockRejectedValue(new Error('Disk unavailable'))
		const onError = vi.fn<() => void>()
		const writer = createViewWriter(onError)
		writer.queue(parseSavedView(undefined, '/default'))
		await vi.advanceTimersByTimeAsync(200)
		expect(onError).toHaveBeenCalledOnce()
		vi.mocked(request).mockResolvedValue({ saved: true })
		writer.queue(parseSavedView({ command: 'retry' }, '/default'))
		await writer.flush()
		expect(request).toHaveBeenCalledTimes(2)
	})
})
