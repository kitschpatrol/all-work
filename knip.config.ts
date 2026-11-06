import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	entry: [
		'electron-builder.ts',
		'electron.vite.config.ts',
		'electron/main.ts',
		'electron/preload.ts',
		'electron/server.ts',
	],
	ignoreDependencies: [
		'@kitschpatrol/chagent', // Typically invoked through bumpp's --execute argument, which Knip doesn't parse
	],
})
