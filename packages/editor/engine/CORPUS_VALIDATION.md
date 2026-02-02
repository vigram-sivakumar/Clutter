# Corpus Validation Guide

**Purpose:** Validate migration correctness before deploying Lexical editor.

**Context:** No legacy user data exists. These tests represent **future risk**, not past data.

---

## What Is This?

**Synthetic Corpus** = 9 canonical PM documents representing edge cases

**Corpus Validation** = Automated test suite ensuring migration correctness

**Gate Condition:** Migration must pass all 9 tests before Lexical editor goes live.

---

## The 9 Test Cases

### 1. Empty Document

**Risk:** Null/undefined handling, empty arrays  
**Expected:** 0 blocks (valid empty state)

```typescript
{
  type: 'doc',
  content: []
}
```

### 2. Single Paragraph

**Risk:** Basic conversion path  
**Expected:** 1 block, plain text preserved

```typescript
{
  type: 'doc',
  content: [{
    type: 'paragraph',
    attrs: { blockId: 'block-1', indent: 0 },
    content: [{ type: 'text', text: 'Hello world' }]
  }]
}
```

### 3. Mixed Formatting

**Risk:** Mark conversion, format bitmask calculation  
**Expected:** 1 block, all marks converted to Lexical format

```typescript
// Bold, italic, code, combined marks
content: [
  { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
  { type: 'text', text: ' and ' },
  { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
  // ... etc
];
```

### 4. Deep Indent Tree

**Risk:** Tree reconstruction from flat indent, parent/children relationships  
**Expected:** 7 blocks with correct hierarchy (max depth 3)

```typescript
// indent: 0 → 1 → 2 → 3
// Tests parent/children linking
```

### 5. All Block Types

**Risk:** Node type mapping, special attributes  
**Expected:** 8 blocks (paragraph, heading1, heading2, bullet, numbered, todo, quote, code)

```typescript
// Tests: headingLevel, listType, checked, language attrs
```

### 6. Pathological Formatting

**Risk:** Nested marks, empty text nodes, edge cases  
**Expected:** Graceful handling, no crashes

```typescript
// Empty text nodes
// Triple nested marks
// Whitespace-only nodes
// Unicode/emoji
// All marks combined
```

### 7. Invalid Attributes

**Risk:** Runtime crashes on missing required fields  
**Expected:** Sensible defaults, no crashes

```typescript
// Missing blockId (should generate)
// Missing timestamps (should generate)
// Missing indent (should default to 0)
// Empty content array
```

### 8. Block with Description

**Risk:** Description attribute preservation  
**Expected:** 2 blocks with descriptions migrated

```typescript
attrs: {
  blockId: 'block-1',
  description: 'This is a description',
  // ...
}
```

### 9. Unknown Node Type

**Risk:** Hard crashes on unknown types  
**Expected:** Graceful degradation to paragraph or skip

```typescript
{
  type: 'futureBlockType', // Unknown type
  // Should not crash
}
```

---

## How to Run Validation

### Method 1: Console (Recommended)

**In browser console:**

```javascript
// Run full validation
runCorpusValidation();
```

**Output:**

```
═══════════════════════════════════════════════════════════════
  SYNTHETIC CORPUS VALIDATION REPORT
═══════════════════════════════════════════════════════════════

Total Tests: 9
Passed: 9 ✅
Failed: 0

✅ Empty Document (0.45ms)
   → 0 blocks migrated

✅ Single Paragraph (1.23ms)
   → 1 blocks migrated

✅ Mixed Formatting (2.15ms)
   → 1 blocks migrated

... (all tests)

═══════════════════════════════════════════════════════════════

✅ ALL TESTS PASSED - Migration is production-ready

═══════════════════════════════════════════════════════════════
```

### Method 2: Programmatic

```javascript
import { validateCorpus } from '@clutter/editor';

const report = validateCorpus();

console.log('Passed:', report.passed);
console.log('Failed:', report.failed);
console.log('Overall:', report.overallPassed);

// Inspect individual results
report.results.forEach((result) => {
  console.log(`${result.testName}: ${result.passed ? '✅' : '❌'}`);
  if (!result.passed) {
    console.error('Errors:', result.errors);
  }
});
```

### Method 3: Individual Test

```javascript
import { SYNTHETIC_CORPUS, migrateDocument } from '@clutter/editor';

// Test specific case
const pmDoc = SYNTHETIC_CORPUS['Deep Indent Tree'];
const result = migrateDocument(pmDoc, {
  preserveBlockIds: true,
  validateTree: true,
});

console.log('Success:', result.success);
console.log('Blocks:', result.blocks);
console.log('Errors:', result.errors);
```

---

## What Gets Validated

### ✅ No Exceptions

- Migration completes without throwing
- Graceful degradation on invalid input

### ✅ Text Preservation

- All text content preserved
- Whitespace normalization allowed
- No silent data loss

### ✅ Tree Structure

- Parent/children relationships valid
- No orphaned blocks
- No circular references
- Max depth correct

### ✅ Attribute Preservation

- `blockId` preserved when present
- `description` migrated
- `createdAt`/`updatedAt` preserved
- Block type-specific attrs (headingLevel, listType, etc.)

### ✅ Formatting

- Marks converted to Lexical format bitmask
- Nested marks handled correctly
- Edge cases (empty text, unicode, etc.)

---

## Gate Condition

**Before deploying Lexical editor:**

```javascript
const report = validateCorpus();

if (!report.overallPassed) {
  throw new Error('❌ Corpus validation failed - do not deploy');
}

// ✅ Safe to proceed with Lexical deployment
```

**Why this is non-negotiable:**

- No real user data to test with
- These cases represent ALL future risk
- If migration fails synthetic corpus, it will fail real usage
- Fix now = prevent production corruption

---

## Expected Results (Reference)

```typescript
{
  'Empty Document': { blockCount: 0, shouldSucceed: true },
  'Single Paragraph': { blockCount: 1, shouldSucceed: true, hasText: true },
  'Mixed Formatting': { blockCount: 1, shouldSucceed: true, hasFormatting: true },
  'Deep Indent Tree': { blockCount: 7, shouldSucceed: true, hasTree: true, maxDepth: 3 },
  'All Block Types': { blockCount: 8, shouldSucceed: true, hasMultipleTypes: true },
  'Pathological Formatting': { blockCount: 1, shouldSucceed: true, hasEdgeCases: true },
  'Invalid Attributes': { blockCount: 4, shouldSucceed: true, hasDefaults: true },
  'Block with Description': { blockCount: 2, shouldSucceed: true, hasDescription: true },
  'Unknown Node Type': { blockCount: 1, shouldSucceed: true, hasGracefulDegradation: true },
}
```

---

## Troubleshooting

### Test Fails: "Text content mismatch"

**Cause:** Migration lost or corrupted text

**Fix:** Check converter for PM node type in question

**Example:**

```
❌ Text content mismatch:
PM: "Hello world"
Blocks: "Helo world"
```

→ Check `convertParagraph`, `convertTextNode`

### Test Fails: "Block references non-existent parent"

**Cause:** Tree reconstruction bug in `buildTreeStructure`

**Fix:** Check indent-to-tree logic

### Test Fails: "Expected X blocks, got Y"

**Cause:** Node being silently dropped or duplicated

**Fix:** Check `convertPMNodeToBlock` for missing type handler

### Test Throws Exception

**Cause:** Unhandled edge case

**Fix:** Add try/catch with graceful degradation

---

## Adding New Test Cases

**When to add:**

- New PM node type added
- Edge case discovered in production
- Regression prevention

**How to add:**

1. Add to `syntheticCorpus.ts`:

```typescript
export const NEW_EDGE_CASE: PMDocument = {
  type: 'doc',
  content: [
    /* ... */
  ],
};
```

2. Add to `SYNTHETIC_CORPUS` object:

```typescript
export const SYNTHETIC_CORPUS = {
  // ... existing cases
  'New Edge Case': NEW_EDGE_CASE,
};
```

3. Add expected outcome:

```typescript
export const EXPECTED_OUTCOMES = {
  // ... existing outcomes
  'New Edge Case': {
    blockCount: 1,
    shouldSucceed: true,
    // ... custom checks
  },
};
```

4. Rebuild and rerun validation

---

## Files

**Corpus:**

- `packages/editor/engine/migration/__tests__/syntheticCorpus.ts`

**Validator:**

- `packages/editor/engine/migration/__tests__/corpusValidation.ts`

**Exports:**

- `packages/editor/engine/migration/index.ts`

**Total Lines:** ~800

---

## Bottom Line

**Synthetic corpus is your safety net.**

- ✅ No legacy data = corpus IS your regression suite
- ✅ Pass corpus = production-ready
- ✅ Fail corpus = do not deploy
- ✅ Add edge cases = prevent regressions

**Run validation now:**

```javascript
runCorpusValidation();
```

If all tests pass → proceed to Step 7B (render Lexical as primary).

If tests fail → fix converters, rerun, repeat.

---

**Status:** Ready to validate ✅
