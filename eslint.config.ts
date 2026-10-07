import { eslintConfig } from '@kitschpatrol/eslint-config'

export default eslintConfig({
	svelte: true,
	ts: {
		overrides: {
			'depend/ban-dependencies': [
				'error',
				{
					allowed: ['execa', 'globby'],
				},
			],
		},
	},
})
