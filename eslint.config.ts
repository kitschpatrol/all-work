import { eslintConfig } from '@kitschpatrol/eslint-config'

export default eslintConfig({
	html: {
		overrides: {
			'@html-eslint/no-inline-styles': 'off',
			'@html-eslint/require-title': 'off',
		},
	},
	svelte: true,
	ts: {
		overrides: {
			'depend/ban-dependencies': [
				'error',
				{
					allowed: ['execa', 'globby'],
				},
			],
			// TODO remove in next patch of shared-config
			// Knip workaround...
			// https://github.com/webpro-nl/knip/issues/158#issuecomment-1632648598
			'jsdoc/check-tag-names': ['error', { definedTags: ['public'] }],
		},
	},
})
