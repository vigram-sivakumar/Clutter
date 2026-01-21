module.exports = {
  root: true,
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    node: true,
    es2022: true,
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  ignorePatterns: [
    'node_modules',
    'dist',
    'build',
    '.next',
    '.turbo',
    'coverage',
    '**/*.config.js',
    '**/*.config.ts',
  ],
  // Default rules (can be overridden by package-specific configs)
  rules: {
    'react/react-in-jsx-scope': 'off',
    // Let TypeScript handle unused vars - keep dev flow fast
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn', // warn during dev, can be error in CI
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    // Allow 'any' during rapid development - can tighten later
    '@typescript-eslint/no-explicit-any': 'warn',
    // Custom keyboard architecture rules
    // Note: Custom plugin requires ESLint 9+ or eslint-plugin-local package
    // For now, the withUISafety wrapper + code review enforce the pattern
    // 'keyboard/require-ui-safety-wrapper': 'error',
  },
  overrides: [
    {
      files: [
        'packages/ui/**/*.{ts,tsx}',
        'packages/editor/**/*.{ts,tsx}',
        'apps/desktop/**/*.{ts,tsx}',
        'apps/web/**/*.{ts,tsx}',
      ],
      env: {
        browser: true,
        es2022: true,
      },
      globals: {
        React: 'readonly',
        NodeJS: 'readonly',
      },
    },
  ],
};
