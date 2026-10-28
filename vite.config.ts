import adapterNode from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapterNode(),
			preprocess: vitePreprocess(),
		}),
	],
	test: {
		projects: [
			{
				extends: true,
				test: {
					exclude: ['src/**/*.svelte.test.ts'],
					include: ['src/**/*.{test,spec}.{js,ts}'],
					name: 'node',
				},
			},
			// Rune tests run Svelte's client runtime, where effects run and derived values memoize
			{
				extends: true,
				resolve: { conditions: ['browser'] },
				test: {
					environment: './src/test/svelte-client-environment.ts',
					include: ['src/**/*.svelte.test.ts'],
					name: 'svelte',
					server: { deps: { inline: ['svelte'] } },
				},
			},
		],
	},
})
