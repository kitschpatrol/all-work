// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	var _allwork: undefined | { chooseDirectory: () => Promise<string | undefined> }
	namespace App {
		// Interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {}
