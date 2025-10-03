module.exports = {
	root: true,
	env: {
		browser: false,
		es6: true,
		node: true,
		jest: true,
	},
	parser: '@typescript-eslint/parser',
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2020,
	},
	plugins: ['@typescript-eslint'],
	extends: ['eslint:recommended'],
	rules: {
		'no-unused-vars': 'off',
		'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
		'no-console': 'warn',
		'prefer-const': 'error',
		'no-case-declarations': 'off',
		'no-undef': 'off', // TypeScript handles this
	},
	overrides: [
		{
			files: ['**/*.test.ts'],
			env: {
				jest: true,
			},
		},
	],
};
