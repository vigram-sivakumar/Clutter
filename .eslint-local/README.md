# Custom ESLint Rules for Editor Architecture

This directory contains custom ESLint rules that enforce architectural contracts for the editor.

## Status

⚠️ **Currently Disabled** - Requires ESLint 9+ or `eslint-plugin-local` package

The rules are fully implemented and ready to use, but are not currently loaded due to ESLint 8's limitations with custom local plugins.

## Rules

### `require-ui-safety-wrapper`

**Category:** Keyboard Architecture  
**Severity:** Error

Enforces that all keyboard handlers in `/keyboard/keymaps/` are wrapped with `withUISafety()`.

**What it catches:**

- ❌ Unwrapped function exports
- ❌ Direct function declarations
- ❌ Missing withUISafety wrapper

**Why this matters:**
UI intent must always win over structural handlers to prevent menu/autocomplete conflicts.

---

### `no-manual-block-create`

**Category:** Block Identity  
**Severity:** Error

Prevents manual `.create()` calls on ProseMirror schema nodes, which can bypass blockId assignment.

**What it catches:**

- ❌ `state.schema.nodes.paragraph.create({ ... })`
- ❌ `schema.nodes['heading'].create({ ... })`
- ❌ Any direct `.create()` on schema nodes

**What it enforces:**

- ✅ Use `createBlockNode(schema, { type: 'paragraph', ... })`
- ✅ Use `createCleanBlockAttrs(node, indent)` for cloning

**Why this matters:**
Manual `.create()` calls bypass blockId assignment, creating temporal identity gaps and potential race conditions. All blocks must have IDs assigned at creation time, not lazily via BlockIdGenerator.

**Exceptions:**
Use `// eslint-disable-next-line no-manual-block-create` for legitimate low-level operations (rare).

## How to Enable

### Option 1: Upgrade to ESLint 9+ (Recommended)

ESLint 9+ has native support for local plugins:

```javascript
// .eslintrc.js
const editorPlugin = require('./.eslint-local');

module.exports = {
  plugins: {
    editor: editorPlugin,
  },
  rules: {
    'editor/require-ui-safety-wrapper': 'error',
    'editor/no-manual-block-create': 'error',
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
    'local/no-manual-block-create': 'error',
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
- `rules/require-ui-safety-wrapper.js` - Keyboard handler wrapper enforcement
- `rules/no-manual-block-create.js` - Block creation pattern enforcement
- `README.md` - This file
