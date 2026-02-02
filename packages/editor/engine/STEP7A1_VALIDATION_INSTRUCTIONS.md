# Step 7A.1: Run Corpus Validation

**You're here because:** No legacy user data exists. Validation = correctness check, not data safety net.

**What to do:** Run synthetic corpus validation in browser console.

---

## Quick Start (Do This Now)

### 1. Start Dev Server

```bash
npm run dev
```

### 2. Open App in Browser

Navigate to: `http://localhost:1420` (or your dev port)

### 3. Open Browser Console

- **Chrome/Edge:** `Cmd+Option+J` (Mac) or `Ctrl+Shift+J` (Windows)
- **Firefox:** `Cmd+Option+K` (Mac) or `Ctrl+Shift+K` (Windows)
- **Safari:** `Cmd+Option+C` (Mac)

### 4. Run Validation

**In console:**

```javascript
runCorpusValidation();
```

### 5. Check Results

**Expected output:**

```
═══════════════════════════════════════════════════════════════
  SYNTHETIC CORPUS VALIDATION REPORT
═══════════════════════════════════════════════════════════════

Total Tests: 9
Passed: 9 ✅
Failed: 0

✅ Empty Document (0.45ms)
✅ Single Paragraph (1.23ms)
✅ Mixed Formatting (2.15ms)
✅ Deep Indent Tree (3.67ms)
✅ All Block Types (4.21ms)
✅ Pathological Formatting (2.89ms)
✅ Invalid Attributes (1.95ms)
✅ Block with Description (2.34ms)
✅ Unknown Node Type (1.12ms)

═══════════════════════════════════════════════════════════════

✅ ALL TESTS PASSED - Migration is production-ready

═══════════════════════════════════════════════════════════════
```

---

## What If Tests Fail?

### Example Failure Output

```
═══════════════════════════════════════════════════════════════
  SYNTHETIC CORPUS VALIDATION REPORT
═══════════════════════════════════════════════════════════════

Total Tests: 9
Passed: 7 ✅
Failed: 2 ❌

✅ Empty Document (0.45ms)
✅ Single Paragraph (1.23ms)
❌ Mixed Formatting (2.15ms)
   ❌ Text content mismatch:
   PM: "Bold and italic and code"
   Blocks: "Bold and  and code"

✅ Deep Indent Tree (3.67ms)
✅ All Block Types (4.21ms)
❌ Pathological Formatting (2.89ms)
   ❌ Exception thrown: Cannot read property 'text' of undefined

... (rest of tests)

═══════════════════════════════════════════════════════════════

❌ TESTS FAILED - Fix issues before deploying Lexical editor

═══════════════════════════════════════════════════════════════
```

### Debug Individual Test

```javascript
import { SYNTHETIC_CORPUS, migrateDocument } from '@clutter/editor';

// Get failing test case
const pmDoc = SYNTHETIC_CORPUS['Mixed Formatting'];

// Run migration
const result = migrateDocument(pmDoc, {
  preserveBlockIds: true,
  validateTree: true,
});

// Inspect result
console.log('Success:', result.success);
console.log('Blocks:', result.blocks);
console.log('Errors:', result.errors);

// Inspect specific block
const block = result.blocks[0];
console.log('Block content:', JSON.parse(block.content));
```

### Common Issues

**1. Text content mismatch**

→ Check `convertTextNode` or `convertInlineContent` in `converters.ts`

**2. Tree structure errors**

→ Check `buildTreeStructure` in `migrateDocument.ts`

**3. Exception thrown**

→ Add null checks and graceful degradation

**4. Wrong block count**

→ Check node type handler in `convertPMNodeToBlock`

---

## Programmatic Validation (CI/CD)

**For automated testing:**

```typescript
import { validateCorpus } from '@clutter/editor';

const report = validateCorpus();

if (!report.overallPassed) {
  console.error('Corpus validation failed:');
  report.results
    .filter((r) => !r.passed)
    .forEach((r) => {
      console.error(`\n${r.testName}:`);
      r.errors.forEach((err) => console.error(`  - ${err}`));
    });

  process.exit(1);
}

console.log('✅ Corpus validation passed');
```

---

## Next Steps

### If All Tests Pass ✅

**You're ready for Step 7B: Render Lexical as Primary**

```
✅ Migration correctness validated
✅ No text loss
✅ Tree structure correct
✅ Edge cases handled

→ Safe to render Lexical editor
```

**Next:** Create Lexical document editor component and wire it up.

### If Tests Fail ❌

**Do NOT proceed to Step 7B**

```
❌ Fix migration issues first
❌ Rerun validation
❌ Repeat until all tests pass
```

**Why:** Migration bugs will corrupt user documents in production.

---

## Validation Checklist

Before moving to Step 7B:

- [ ] Dev server running
- [ ] Browser console open
- [ ] `runCorpusValidation()` executed
- [ ] All 9 tests passed ✅
- [ ] No errors in console
- [ ] No warnings requiring action

**If all checked:** Migration is production-ready. Proceed to Step 7B.

---

## Help

**Validation not running?**

```javascript
// Check if function is available
typeof runCorpusValidation;
// Should output: "function"

// If undefined, check imports
import { runCorpusValidation } from '@clutter/editor';
```

**Want detailed results?**

```javascript
const report = validateCorpus();

// Full report object
console.log(JSON.stringify(report, null, 2));

// Specific test details
const failedTests = report.results.filter((r) => !r.passed);
console.log('Failed tests:', failedTests);
```

**Need to inspect blocks?**

```javascript
import { SYNTHETIC_CORPUS, migrateDocument } from '@clutter/editor';

const pmDoc = SYNTHETIC_CORPUS['Deep Indent Tree'];
const result = migrateDocument(pmDoc);

// Inspect tree structure
result.blocks.forEach((block) => {
  console.log(
    `${block.id}: parent=${block.parent}, children=${block.children.length}`
  );
});
```

---

## Bottom Line

**This is the gate.**

- ✅ Pass = migration works correctly
- ❌ Fail = fix before deploying

**Run validation now:**

```javascript
runCorpusValidation();
```

Then report results. 🎯
