# Enabling the Design Token ESLint Rule

The `use-design-tokens` ESLint rule is implemented and ready to use, but requires ESLint 9+ or the `eslint-plugin-local` package to load custom local rules.

## Current Status

✅ Rule implemented: `.eslint-local/rules/use-design-tokens.js`  
✅ Rule registered: `.eslint-local/rules/index.js`  
✅ Documentation complete: `.eslint-local/README.md`  
⚠️ Not yet active: ESLint 8 limitation

## Option 1: Upgrade to ESLint 9+ (Recommended)

ESLint 9+ has native support for local plugins.

### 1. Upgrade ESLint

```bash
npm install --save-dev eslint@^9.0.0
```

### 2. Update `.eslintrc.js`

```javascript
const editorPlugin = require('./.eslint-local');

module.exports = {
  root: true,
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  plugins: {
    editor: editorPlugin,
  },
  rules: {
    // ... existing rules

    // Custom architectural rules
    'editor/require-ui-safety-wrapper': 'error',
    'editor/no-manual-block-create': 'error',
    'editor/use-design-tokens': 'error', // NEW
  },
};
```

### 3. Verify it works

```bash
# Should catch violations
npm run lint

# Example output:
# packages/editor/components/shared/EditorErrorFallback.tsx
#   22:27  error  Avoid hardcoded color "#fafaf8". Use tokens from @clutter/ui/tokens/colors  editor/use-design-tokens
```

## Option 2: Use eslint-plugin-local

For projects that can't upgrade to ESLint 9 yet.

### 1. Install the plugin

```bash
npm install --save-dev eslint-plugin-local
```

### 2. Configure the plugin path

Create `.eslintpluginrc.js` in the project root:

```javascript
module.exports = {
  pluginPath: './.eslint-local',
};
```

### 3. Update `.eslintrc.js`

```javascript
module.exports = {
  root: true,
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  plugins: ['local'],
  rules: {
    // ... existing rules

    // Custom architectural rules
    'local/require-ui-safety-wrapper': 'error',
    'local/no-manual-block-create': 'error',
    'local/use-design-tokens': 'error', // NEW
  },
};
```

## Gradual Rollout Strategy

If you have many existing violations, consider a gradual approach:

### Phase 1: Warning Mode (Start Here)

```javascript
rules: {
  'editor/use-design-tokens': 'warn', // Warning only
}
```

This will highlight violations without blocking builds.

### Phase 2: Error in CI Only

```javascript
rules: {
  'editor/use-design-tokens': process.env.CI ? 'error' : 'warn',
}
```

### Phase 3: Full Enforcement

Once most violations are fixed:

```javascript
rules: {
  'editor/use-design-tokens': 'error',
}
```

## Fixing Existing Violations

### Automatic Fixes (Limited)

ESLint auto-fix won't work for most token violations, but you can try:

```bash
npm run lint:fix
```

### Manual Migration

Use the examples in [examples.md](examples.md) to guide manual fixes.

**Common patterns:**

```bash
# Find all hex colors
rg '#[0-9a-fA-F]{6}' --type tsx --type ts

# Find all rgba colors
rg 'rgba?\(' --type tsx --type ts

# Find common magic numbers
rg 'padding: \d+' --type tsx --type ts
```

### Prioritize Files

Start with the most important/frequently changed files:

1. Core UI components (`packages/ui/components`)
2. Editor components (`packages/editor/components`)
3. App-level components (`apps/*/src`)
4. Less frequently changed code

## Exceptions

For legitimate exceptions (error fallbacks, system colors), add a comment:

```tsx
// eslint-disable-next-line use-design-tokens
// JUSTIFICATION: Error fallback when theme system unavailable
<div style={{ backgroundColor: '#fafaf8' }}>
```

**Valid exception reasons:**

- Error boundary fallback UI (theme system may be crashed)
- OS/system standard colors (macOS traffic lights)
- Third-party library requirements (chart colors, map styles)
- Temporary during migration (with FIXME comment)

**Invalid exception reasons:**

- "It's easier to hardcode"
- "I don't know which token to use"
- "The token value isn't exactly right"

## Testing the Rule

See [.eslint-local/TEST_RULE.md](../../.eslint-local/TEST_RULE.md) for test cases.

Quick test:

```bash
cat > /tmp/test-tokens.tsx << 'EOF'
export const Bad = () => <div style={{ color: '#fff' }} />;
EOF

npx eslint /tmp/test-tokens.tsx
rm /tmp/test-tokens.tsx
```

Should show an error about hardcoded color.

## Troubleshooting

### "Cannot find plugin 'editor'"

Make sure you've installed ESLint 9+ or eslint-plugin-local and configured it correctly.

### "Rule 'use-design-tokens' not found"

Verify the rule is exported in `.eslint-local/rules/index.js`:

```javascript
module.exports = {
  'use-design-tokens': require('./use-design-tokens'),
};
```

### Too many violations

Start with warning mode or configure specific paths:

```javascript
overrides: [
  {
    files: ['packages/ui/components/**/*.{ts,tsx}'],
    rules: {
      'editor/use-design-tokens': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'editor/use-design-tokens': 'warn', // Everything else: warn
    },
  },
],
```

## Next Steps

1. Enable the rule in warning mode
2. Review violations: `npm run lint`
3. Fix high-priority violations using [examples.md](examples.md)
4. Switch to error mode when ready
5. Add to CI/CD pipeline to prevent new violations
