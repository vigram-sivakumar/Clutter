# 🔒 Architecture Hardening

This directory contains **zero-risk architectural enforcement**.

## Purpose

Prevent regression of the segmented architecture through:
1. **Compile-time guards** (TypeScript + ESLint)
2. **Runtime invariants** (assertions)
3. **Automated checks** (CI scripts)
4. **Developer guidance** (forbidden patterns)

---

## Files

### `invariants.ts`
Runtime assertions that enforce architectural guarantees.

**When to use:**
- After every mutation: `assertNodeIntegrity(node, cursor)`
- Before every commit: `assertCommitIntegrity(nodes)`
- In tests: All invariant functions

**Guarantees:**
- Segments array is valid
- Cursor position is valid
- Split/merge preserve content
- No data corruption

### `keyboard-ownership.ts`
Single source of truth for keyboard event handling.

**Usage:**
```ts
if (isBrowserOwned(e.key)) {
  return; // Let browser handle
}

if (isEditorOwned(e.key)) {
  e.preventDefault();
  // Handle in editor
}
```

**Guarantees:**
- No ownership ambiguity
- No per-handler discretion
- No heuristics

### `split-state-machine.ts`
Exhaustive, compiler-enforced Enter key behavior.

**Usage:**
```ts
const { head, tail, splitCase } = performGuaranteedSplit(segments, cursor);
```

**Guarantees:**
- All split cases handled
- Content never duplicated
- Content never lost
- Compiler enforces exhaustiveness

### `forbidden.ts`
Documentation of patterns that must never return.

**Forbidden:**
- `node.text` → use `getPlainText(node.segments)`
- `node.meta` → use segments
- `TreeWalker` → use direct iteration
- `bias` → use segmentIndex
- `extractPureText` → use `getPlainText()`

### `.eslintrc.hardening.js`
ESLint rules that block forbidden patterns at compile time.

**Enforces:**
- No `node.text` access
- No direct SegmentOps imports
- No legacy editor references

---

## CI Integration

Add to `.github/workflows/ci.yml`:

```yaml
- name: Check Architecture Locks
  run: ./scripts/check-architecture-locks.sh
```

This ensures:
- Single editor constraint
- No legacy files
- No forbidden patterns
- Hardening infrastructure intact

---

## For Future Developers

### ✅ ALLOWED
- Reading `node.segments`
- Calling `handleSegmentedInput()`, `handleSegmentedEnter()`, etc.
- Using `getPlainText(node.segments)` for display
- Iterating `node.segments` with caret-anchors

### ❌ FORBIDDEN
- Writing to `node.segments` directly
- Using `node.text` or `node.meta`
- Importing `SegmentOps` directly (use `editor/index.ts`)
- Adding text manipulation logic to `NodeEditor.tsx`
- Creating a second editor

### ⚠️ IF YOU THINK YOU NEED A FORBIDDEN PATTERN
**Stop. You don't.**

The segmented architecture provides everything you need:
- **Atomic operations**: Use `handleSegmentedInput()`, etc.
- **Queries**: Use `matchGrammar()`, `getPlainText()`, etc.
- **Mutations**: All go through `SegmentedEditor`

If you're tempted to:
- "Just read `node.text` this once" → Use `getPlainText(node.segments)`
- "Need to parse content" → Use `SegmentQuery` functions
- "Want to mutate directly" → Use `SegmentedEditor` API

**The old patterns were deleted because they caused bugs.**
**Don't bring them back.**

---

## Testing

Run invariant tests:
```bash
npm test -- hardening
```

Run architecture check:
```bash
./scripts/check-architecture-locks.sh
```

---

## Guarantee Level

This hardening provides **mathematical certainty** that:
- Enter key cannot duplicate content (no string manipulation exists)
- Cursor cannot drift (no bias calculations exist)
- Dual-mode cannot return (types prevent it)
- UI cannot bypass invariants (SegmentOps is internal)

**If these measures are maintained, the architecture cannot regress.**
