# Testing Custom ESLint Rules

## Quick Test (Once Rules Are Enabled)

### Test no-manual-block-create Rule

Create a test file with a violation:

```bash
cat > /tmp/test-block-create.ts << 'EOF'
import { Editor } from '@tiptap/core';

export function testHandler(editor: Editor) {
  const { state } = editor;

  // This should trigger the rule
  const node = state.schema.nodes.paragraph.create({ indent: 0 });

  return true;
}
EOF

# Run ESLint (should fail when rule is enabled)
npx eslint /tmp/test-block-create.ts

# Clean up
rm /tmp/test-block-create.ts
```

**Expected output when rule is enabled:**

```
/tmp/test-block-create.ts
  7:16  error  Do not use manual .create() on schema nodes.
               Use createBlockNode() or createCleanBlockAttrs() instead
               editor/no-manual-block-create

✖ 1 problem (1 error, 0 warnings)
```

### Test Exception Comment

```typescript
// This should NOT trigger the rule (has exception comment)
// eslint-disable-next-line no-manual-block-create
// JUSTIFICATION: Testing low-level ProseMirror behavior
const node = state.schema.nodes.paragraph.create({ blockId: 'test' });
```

## Current Status

✅ Rule implemented and ready  
✅ Rule exported from rules/index.js  
✅ Documentation complete  
⚠️ Not yet active (ESLint 8 limitation)

## Activation Steps

See `.eslint-local/README.md` for full activation instructions with ESLint 9+ or eslint-plugin-local.
