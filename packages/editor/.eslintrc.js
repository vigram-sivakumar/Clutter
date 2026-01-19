module.exports = {
  extends: ['../../.eslintrc.js'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  env: {
    browser: true,
    es2022: true,
  },
  globals: {
    React: 'readonly',
    NodeJS: 'readonly',
  },
  ignorePatterns: ['node_modules', 'dist', '**/__validation__.ts'],
  rules: {
    // 🔒 EDITOR BOUNDARY: Isolated editing engine
    // ❌ CANNOT import: domain, state, shared (ENFORCED)
    // ✅ CAN import: ui (for presentational primitives only)
    //
    // Editor is intentionally isolated from app LOGIC (domain/state).
    // UI imports are allowed for presentational components (icons, buttons, design tokens).
    // This is pragmatic: editor needs to render React components, and duplicating
    // the entire design system would create unnecessary maintenance burden.
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@clutter/domain', '@clutter/domain/*'],
            message:
              '❌ editor must not import from domain. Use EditorProvider for dependency injection.',
          },
          {
            group: ['@clutter/state', '@clutter/state/*'],
            message:
              '❌ editor must not import from state. Use EditorProvider for dependency injection.',
          },
          {
            group: ['@clutter/shared', '@clutter/shared/*'],
            message:
              '❌ editor must not import from shared. Editor owns its own types and contracts.',
          },
        ],
      },
    ],
  },
};
