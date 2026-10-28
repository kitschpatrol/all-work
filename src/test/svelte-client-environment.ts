import type { Environment } from 'vitest/runtime'

/**
 * Runs tests in Node while compiling Svelte modules for the browser, so runes
 * in `*.svelte.test.ts` files run effects and memoize derived values as they do
 * in the app. The default Node environment compiles them for the server, where
 * effects never run.
 */
export default {
	name: 'svelte-client',
	setup() {
		return {
			teardown() {
				// The Node globals need no restoring
			},
		}
	},
	viteEnvironment: 'client',
} satisfies Environment
