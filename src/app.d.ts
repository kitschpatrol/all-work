import type { AllWorkApi } from '#lib/electron-api.js'

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	var _allwork: AllWorkApi | undefined
	namespace App {
		// Interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {}
