import type { Configuration } from 'electron-builder'

const config: Configuration = {
	appId: 'com.ericmika.all-work',
	// eslint-disable-next-line no-template-curly-in-string
	artifactName: '${name}_${version}-${os}-${arch}.${ext}',
	files: ['build/**/*', 'out/**/*'],
	linux: { icon: 'electron/resources/icons/png/1024x1024.png', target: 'tar.gz' },
	mac: {
		category: 'public.app-category.developer-tools',
		entitlements: 'electron/resources/mac/entitlements.mac.plist',
		entitlementsInherit: 'electron/resources/mac/entitlements.mac.plist',
		gatekeeperAssess: false,
		hardenedRuntime: true,
		icon: 'electron/resources/icons/mac/icon.icns',
		target: 'zip',
	},
	nsis: { allowToChangeInstallationDirectory: true, oneClick: false },
	productName: 'All Work',
	publish: { provider: 'github', releaseType: 'release', vPrefixedTagName: true },
	win: { icon: 'electron/resources/icons/win/icon.ico', target: 'nsis' },
}

export default config
