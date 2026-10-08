import { eslintConfig } from '@kitschpatrol/eslint-config'

export default eslintConfig({
	svelte: true,
	ts: {
		overrides: {
			'depend/ban-dependencies': [
				'error',
				{
					// Read-pkg normalizes author and repository metadata used by Project.
					allowed: ['execa', 'globby', 'read-pkg'],
				},
			],
		},
	},
})
