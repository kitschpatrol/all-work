/* eslint-disable perfectionist/sort-objects */
/* @type {import('eslint').Linter.Config} */
module.exports = {
	root: true,
	extends: ['@kitschpatrol/eslint-config'],
	// Overrides
	rules: {
		'@html-eslint/no-inline-styles': 'off',
		'@html-eslint/require-title': 'off',
	},
}
