import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['src/**/*.{js,jsx,cjs}', 'scripts/**/*.js'],
        languageOptions: { globals: globals.node, parserOptions: { ecmaFeatures: { jsx: true } } },
        rules: {
            'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z]', argsIgnorePattern: '^_', caughtErrors: 'none' }],
            'no-empty': ['error', { allowEmptyCatch: true }],
            'no-control-regex': 'off',
        },
    },
    {
        files: ['src/desktop/renderer.js'],
        languageOptions: { globals: globals.browser },
    },
];
