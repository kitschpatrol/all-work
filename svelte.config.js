import adapterNode from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

// TODO needed?
const adapterConfig = {
	routes: {
		include: ['/*'],
		exclude: ['<all>'],
	},
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	kit: {
		// Adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://kit.svelte.dev/docs/adapters for more information about adapters.
		adapter: adapterNode(adapterConfig),
	},

	// For more information about preprocessors
	preprocess: vitePreprocess(),
}

export default config
