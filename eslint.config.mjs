import config from '@iobroker/eslint-config';

export default [
    ...config,
    {
        languageOptions: {
            parserOptions: {
                projectService: { allowDefaultProject: ['*.js', '*.mjs'] },
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        // The detection modules are data-driven wrappers around foreign protocols,
        // JSDoc on every helper would be noise.
        rules: {
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param': 'off',
            'jsdoc/check-param-names': 'off',
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
    {
        ignores: [
            'build/**/*',
            'src-admin/build/**/*',
            'src-admin/node_modules/**/*',
            'node_modules/**/*',
            'admin/**/*',
            'test/**/*',
            'tmp/**/*',
            '**/*.mjs',
        ],
    },
];
