import { defineConfig } from '@kitschpatrol/electron-vite'
import rendererConfig from './vite.config'

export default defineConfig(({ command }) => ({
	main: {
		build: {
			externalizeDeps: true,
			lib: { entry: { main: 'electron/main.ts', server: 'electron/server.ts' } },
			sourcemap: 'inline',
		},
	},
	preload: {
		build: {
			// Sandboxed preloads can only require Electron and a few built-ins, so
			// any dependencies must be bundled in
			externalizeDeps: false,
			lib: { entry: 'electron/preload.ts', formats: ['cjs'] },
			sourcemap: 'inline',
		},
	},
	// In development, electron-vite runs the SvelteKit dev server as the
	// renderer. SvelteKit's production build needs Vite's builder API, which
	// electron-vite does not use, so `pnpm build` runs `vite build` separately.
	...(command === 'serve' && {
		renderer: {
			...rendererConfig,
			// Satisfies electron-vite's renderer validation; SvelteKit's dev server ignores it
			build: { rollupOptions: { input: 'src/app.html' } },
			root: '.',
		},
	}),
}))
