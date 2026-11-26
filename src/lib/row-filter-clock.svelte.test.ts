import { flushSync, tick } from 'svelte'
import { expect, it, vi } from 'vitest'
import { createRowFilter } from './row-filter-state.svelte.js'

it('reevaluates a relative date each minute and releases its clock when the rule is removed', async () => {
	vi.useFakeTimers()
	const state = createRowFilter({
		clearedRuns: () => [],
		identity: () => ({ authorNames: [], githubAccounts: [] }),
		onChange: vi.fn<() => void>(),
		runs: () => [],
	})
	const observe = vi.fn<(matches: typeof state.matches) => void>()
	const stop = $effect.root(() => {
		$effect(() => observe(state.matches))
	})
	try {
		flushSync()
		state.applyPreset('recentlyActive')
		flushSync()
		observe.mockClear()
		vi.advanceTimersByTime(60_000)
		flushSync()
		expect(observe).toHaveBeenCalledOnce()
		state.applyPreset('changed')
		flushSync()
		await tick()
		expect(vi.getTimerCount()).toBe(0)
	} finally {
		stop()
		vi.useRealTimers()
	}
})
