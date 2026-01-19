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
    // ❌ CANNOT import: editor, apps
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@clutter/editor', '@clutter/editor/*'],
            message:
              '❌ ui cannot import from editor. Apps compose editor + ui separately. (Phase 2-4 Complete)',
          },
        ],
      },
    ],
  },
};
