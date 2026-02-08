module.exports = {
  extends: ['../../.eslintrc.js'],
  env: {
    browser: true,
    es2022: true,
  },
  globals: {
    React: 'readonly',
    NodeJS: 'readonly',
  },
  rules: {
    // 🔒 UI BOUNDARY: Presentational components
    // ✅ CAN import: domain, state, shared
    // ❌ CANNOT import: apps (editor lives in apps/engine-demo)
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['../../../apps/*', '../../apps/*'],
            message:
              '❌ ui cannot import from apps. Editor is composed at app layer only.',
          },
        ],
      },
    ],
  },
};
