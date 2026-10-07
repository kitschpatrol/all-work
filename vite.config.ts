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
		include: ['src/**/*.{test,spec}.{js,ts}'],
	},
})
