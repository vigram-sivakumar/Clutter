# Custom ESLint Rules for Keyboard Architecture

This directory contains custom ESLint rules that enforce architectural contracts for keyboard handlers.

## Status

⚠️ **Currently Disabled** - Requires ESLint 9+ or `eslint-plugin-local` package

The rules are fully implemented and ready to use, but are not currently loaded due to ESLint 8's limitations with custom local plugins.

## Rules

### `require-ui-safety-wrapper`

Enforces that all keyboard handlers in `/keyboard/keymaps/` are wrapped with `withUISafety()`.

**What it catches:**

- ✅ Unwrapped function exports
- ✅ Direct function declarations
- ✅ Missing withUISafety wrapper

## How to Enable

### Option 1: Upgrade to ESLint 9+ (Recommended)

ESLint 9+ has native support for local plugins:

```javascript
// .eslintrc.js
const keyboardPlugin = require('./.eslint-local');

module.exports = {
  plugins: {
    keyboard: keyboardPlugin,
  },
  rules: {
    'keyboard/require-ui-safety-wrapper': 'error',
  },
};
```

### Option 2: Use eslint-plugin-local

Install the helper package:

```bash
npm install --save-dev eslint-plugin-local
```

Then configure:

```javascript
// .eslintrc.js
module.exports = {
  plugins: ['local'],
  rules: {
    'local/require-ui-safety-wrapper': 'error',
  },
};
```

## Current Enforcement

Until ESLint rules are enabled, the architecture is enforced by:

1. ✅ **Wrapper Pattern** - `withUISafety` automatically guards handlers
2. ✅ **Runtime Validation** - Dev-mode checks log violations
3. ✅ **Code Review** - PR reviews check for wrapper usage
4. ✅ **Documentation** - ARCHITECTURE.md contract is clear

## Testing the Rule

To test if the rule works (once enabled):

```bash
# This should fail with ESLint error
echo 'export function handleTest() {}' > test-handler.ts
npx eslint test-handler.ts
rm test-handler.ts
```

## Files

- `index.js` - Plugin entry point
- `rules/index.js` - Rules registry
- `rules/require-ui-safety-wrapper.js` - Main enforcement rule
- `README.md` - This file
