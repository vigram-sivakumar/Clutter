# 🧪 Testing the Hardened Architecture

**Complete guide to testing the segmented editor architecture**

---

## 🎯 Quick Start

```bash
# Run all tests
npm test

# Architecture validation (FAST - ~3-5 seconds)
npm run lint:arch                          # Check architectural locks
npm run test:hardening                     # Run hardening tests only
npm test -- split-merge-exhaustive --run   # Split/merge exhaustive tests (51 tests)

# Full test suite
npm run test:run         # All unit tests
npm run test:coverage    # With coverage report
npm test -- --ui         # Interactive test UI
```

**Expected result:** All tests should pass ✅

---

## 🔒 Architecture Testing (Most Important)

### 1. Architecture Locks Check

**What it validates:**
- ✅ Single editor constraint (no duplicate editors)
- ✅ No legacy files exist
- ✅ No forbidden patterns in code (`node.text`, `node.meta`, `bias`)
- ✅ Hardening infrastructure intact
- ✅ Core editor files present

**How to run:**
```bash
npm run lint:arch
```

**Expected output:**
```
🔒 CHECKING ARCHITECTURAL LOCKS...
✓ Single editor confirmed
✓ No legacy files found
✓ No forbidden patterns found
✓ Hardening infrastructure present
✓ All core editor files present
🎯 ALL ARCHITECTURAL LOCKS VERIFIED ✅
```

**If it fails:** Architecture regression detected - check the output for details.

---

### 2. Split & Merge Exhaustive Tests (51 tests)

**What it validates:**
- ✅ Splitting at **every position** in simple text
- ✅ Splitting before/after/around inline elements (refs, mentions)
- ✅ Complex multi-inline node splits  
- ✅ Edge cases: empty nodes, inline-only nodes, long text
- ✅ Split state machine exhaustiveness
- ✅ Merging all configurations (text, inlines, empty)
- ✅ Round-trip tests: split → merge → original
- ✅ Cursor position validation after all operations
- ✅ Data structure integrity (no empty segments, order maintained)
- ✅ Stress tests: 10 inlines, 100 cycles, unicode
- ✅ Invariant enforcement at every step

**How to run:**
```bash
npm test -- split-merge-exhaustive --run
```

**Test file:**
- `apps/engine-demo/src/__tests__/split-merge-exhaustive.test.ts` (51 tests)

**Expected output:**
```
✓ src/__tests__/split-merge-exhaustive.test.ts (51 tests) 7ms

Test Files  1 passed (1)
Tests       51 passed (51)
```

**What it protects:**
- ✅ No content loss during split/merge
- ✅ No content duplication
- ✅ No empty text segments created
- ✅ Valid cursor position after operations
- ✅ Inline elements preserved and ordered correctly
- ✅ Unicode and special characters handled correctly
- ✅ Stability under repeated operations (100+ cycles)

**Detailed documentation:** See [`apps/engine-demo/SPLIT-MERGE-TEST-REPORT.md`](./apps/engine-demo/SPLIT-MERGE-TEST-REPORT.md) for comprehensive coverage analysis.

---

### 3. Hardening Tests (31+ tests)

**What it validates:**
- ✅ Node structure invariants
- ✅ Cursor position validation
- ✅ Split preserves content
- ✅ Merge preserves content
- ✅ Empty text segments rejected
- ✅ Invalid segment types rejected
- ✅ Cursor bounds enforcement

**How to run:**
```bash
npm run test:hardening
```

**Test files:**
- `apps/engine-demo/src/hardening/__tests__/invariants.test.ts` (13 tests)
- `apps/engine-demo/src/__tests__/architecture-invariants.test.ts` (18 tests)

**Expected output:**
```
✓ src/hardening/__tests__/invariants.test.ts (13 tests)
✓ src/__tests__/architecture-invariants.test.ts (18 tests)

Test Files  2 passed (2)
Tests       31 passed (31)
```

---

### 4. Type Check

**What it validates:**
- ✅ All TypeScript compiles correctly
- ✅ No type errors in core editor
- ✅ Forbidden patterns won't compile

**How to run:**
```bash
cd apps/engine-demo
npx tsc --noEmit
```

**Expected:** No errors in core editor files (some non-critical errors in sync/workspace subsystems are okay).

---

## 🧪 Unit Testing

### Run All Unit Tests

```bash
npm test                # Watch mode
npm run test:run        # Run once
npm test -- --ui        # Interactive UI
```

### Run Specific Test Files

```bash
# Hardening tests only
npm test -- hardening

# Architecture invariants only
npm test -- architecture-invariants

# Specific file
npm test -- src/editor/SegmentOps.test.ts
```

### Test Coverage

```bash
npm run test:coverage
```

View coverage report in `coverage/index.html`

---

## 🎭 Manual Testing (Interactive)

### Start the Dev Server

```bash
npm run dev
```

Opens at `http://localhost:5173`

### Test Critical Scenarios

#### 1. **Enter Key (Split Operations)**

Test these scenarios:

```
Scenario 1: Split in middle
  Type: "Hello World"
  Position cursor: "Hello |World"
  Press: Enter
  Expected: 
    - Line 1: "Hello "
    - Line 2: "World"
  ✅ No duplication
  ✅ Cursor on line 2

Scenario 2: Enter at start
  Type: "Hello"
  Position cursor: "|Hello"
  Press: Enter
  Expected:
    - Line 1: (empty)
    - Line 2: "Hello"
  ✅ Content preserved

Scenario 3: Enter at end
  Type: "Hello"
  Position cursor: "Hello|"
  Press: Enter
  Expected:
    - Line 1: "Hello"
    - Line 2: (empty)
  ✅ Cursor moves down
```

#### 2. **Backspace Key (Merge Operations)**

```
Scenario 1: Backspace at start (merge)
  Line 1: "Hello"
  Line 2: "|World"
  Press: Backspace
  Expected: "HelloWorld"
  ✅ Content merged
  ✅ Cursor at merge point

Scenario 2: Backspace empty node
  Line 1: "Hello"
  Line 2: "|"
  Press: Backspace
  Expected: Only "Hello" remains
  ✅ Empty node deleted
```

#### 3. **Typing (Browser-Owned)**

```
Scenario: Normal typing
  Start: Empty node
  Type: "The quick brown fox"
  Expected:
    ✅ Characters appear immediately
    ✅ No cursor jumping
    ✅ No delayed rendering
    ✅ No re-renders per keystroke
```

#### 4. **Arrow Keys**

```
Scenario: Horizontal navigation (Browser-owned)
  Type: "Hello World"
  Press: ArrowLeft multiple times
  Expected:
    ✅ Cursor moves character by character
    ✅ No editor interference
    ✅ Smooth navigation

Scenario: Vertical navigation (Editor-owned)
  Create multiple nodes
  Press: ArrowUp / ArrowDown
  Expected:
    ✅ Moves between nodes
    ✅ Preserves horizontal position
```

#### 5. **Inline Elements** (If implemented)

```
Scenario: Cursor around references
  Type: "Hello @ref World"
  Position cursor before/after @ref
  Press: Enter or Backspace
  Expected:
    ✅ Reference stays intact
    ✅ Correct split behavior
    ✅ No reference corruption
```

---

## 🛡️ Verification Checklist

After making changes, verify:

### ✅ Architecture Locks
```bash
npm run lint:arch
```
**Must pass:** No exceptions

### ✅ Hardening Tests
```bash
npm run test:hardening
```
**Must pass:** All 31+ tests

### ✅ Forbidden Patterns
```bash
# These should fail compilation
node.text                    # ❌ Field doesn't exist
node.meta                    # ❌ Field doesn't exist
cursor.bias                  # ❌ Field doesn't exist
```

### ✅ Manual Smoke Test
1. Start dev server
2. Type in editor
3. Press Enter (split)
4. Press Backspace (merge)
5. Navigate with arrows

**Expected:** Everything works smoothly, no bugs

---

## 🚨 Common Test Failures

### "Empty text segment" Error

**Cause:** Created a text segment with empty string

**Fix:** Never create `{ type: 'text', text: '' }` - filter these out

**Valid in code:**
```typescript
// ❌ Wrong
segments.push({ type: 'text', text: '' });

// ✅ Correct
if (text.length > 0) {
  segments.push({ type: 'text', text });
}
```

---

### "Invalid segmentIndex" Error

**Cause:** Cursor pointing to non-existent segment

**Fix:** Always validate cursor before operations

**Valid in code:**
```typescript
// ✅ Always validate
assertValidCursor(cursor, node);

// ✅ Or check bounds
if (cursor.segmentIndex >= node.segments.length) {
  throw new Error('Invalid cursor');
}
```

---

### "Content mismatch" Error

**Cause:** Split or merge lost content

**Fix:** Use `performGuaranteedSplit()` or `assertSplitPreservesContent()`

**Valid in code:**
```typescript
// ✅ Use guaranteed split
const { head, tail } = performGuaranteedSplit(segments, cursor);

// ✅ Or validate manually
assertSplitPreservesContent(original, head, tail);
```

---

## 🎯 E2E Testing (Playwright)

### Setup

```bash
# Install Playwright (if needed)
npx playwright install
```

### Run E2E Tests

```bash
npm run test:e2e          # Headless mode
npm run test:e2e:ui       # Interactive UI
npm run test:e2e:debug    # Debug mode
```

### View Reports

```bash
npm run test:e2e:report
```

---

## 📊 Test Coverage Goals

### Current Coverage

- **Split & Merge Exhaustive:** 51 tests (every position & edge case)
- **Hardening:** 31+ tests (100% of invariants)
- **Architecture:** All critical paths covered
- **Unit Tests:** Core operations validated
- **Total:** **82+ tests** protecting architectural integrity

### What's Tested

✅ **Node operations**
- Create, split, merge
- Validation, integrity checks

✅ **Cursor operations**
- Positioning, validation
- Bounds checking

✅ **Split/Merge**
- Content preservation (51 exhaustive tests)
- Every possible split position tested
- All merge configurations validated
- Round-trip correctness proven
- State machine exhaustiveness guaranteed

✅ **Forbidden patterns**
- Compile-time blocking
- Runtime detection
- CI enforcement

### What's NOT Tested (Yet)

⚠️ **UI interactions** - Need more E2E tests
⚠️ **Selection handling** - Manual testing required
⚠️ **Undo/Redo** - Integration tests needed
⚠️ **Complex documents** - Stress testing needed

---

## 🔧 Writing New Tests

### For New Features

```typescript
import { describe, it, expect } from 'vitest';
import { assertNodeIntegrity } from './hardening/invariants';

describe('My New Feature', () => {
  it('should maintain architectural invariants', () => {
    const node = myNewFeature();
    
    // ALWAYS validate after mutations
    assertNodeIntegrity(node);
    
    // Your assertions
    expect(node.segments.length).toBeGreaterThan(0);
  });
});
```

### For Architectural Guarantees

Add to `src/__tests__/architecture-invariants.test.ts`:

```typescript
describe('🔒 My Architectural Guarantee', () => {
  it('MUST maintain [guarantee]', () => {
    // Test that your guarantee holds
    // Mark as architectural (MUST NEVER CHANGE)
  });
});
```

---

## 📚 Test Documentation

### Test File Locations

```
apps/engine-demo/
├── src/
│   ├── __tests__/
│   │   └── architecture-invariants.test.ts  ← Architectural tests
│   ├── hardening/__tests__/
│   │   └── invariants.test.ts              ← Hardening tests
│   ├── editor/
│   │   └── *.test.ts                       ← Unit tests (add as needed)
│   └── engine/
│       └── *.test.ts                       ← Core tests (add as needed)
```

### Test Types

| Type | Purpose | Must Pass |
|------|---------|-----------|
| Architecture Locks | Structural constraints | ✅ Always |
| Hardening Tests | Runtime invariants | ✅ Always |
| Architecture Invariants | Behavioral guarantees | ✅ Always |
| Unit Tests | Feature correctness | ✅ Before merge |
| E2E Tests | User workflows | ✅ Before release |

---

## ✅ CI/CD Integration

### GitHub Actions (Recommended)

Add to `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      # 🔒 CRITICAL: Architecture validation
      - name: Architecture Locks
        run: npm run lint:arch
      
      # 🔒 CRITICAL: Hardening tests
      - name: Hardening Tests
        run: npm run test:hardening
      
      # All tests
      - name: Unit Tests
        run: npm run test:run
      
      # Type check
      - name: Type Check
        run: npm run type-check
```

**These checks BLOCK merges if they fail.**

---

## 🎉 Summary

### Quick Test Workflow

```bash
# 1. Architecture validation (FAST - 1 second)
npm run lint:arch

# 2. Split & Merge exhaustive (FAST - <1 second)
npm test -- split-merge-exhaustive --run

# 3. Hardening tests (FAST - 5 seconds)
npm run test:hardening

# 4. All tests (MEDIUM - 30 seconds)
npm run test:run

# 5. Manual check (QUICK - 2 minutes)
npm run dev
# → Test Enter, Backspace, typing
```

### Before Committing

```bash
npm run lint:arch && \
  npm test -- split-merge-exhaustive --run && \
  npm run test:hardening && \
  npm run test:run
```

### Before Merging

```bash
npm run lint:arch
npm test -- split-merge-exhaustive --run
npm run test:hardening
npm run test:run
npm run type-check
# + Manual smoke test in dev server
```

---

## 📖 Further Reading

- **Architecture:** [`docs/architecture/MANIFEST.md`](./docs/architecture/MANIFEST.md)
- **Hardening:** [`docs/architecture/HARDENING.md`](./docs/architecture/HARDENING.md)
- **Split/Merge Tests:** [`apps/engine-demo/SPLIT-MERGE-TEST-REPORT.md`](./apps/engine-demo/SPLIT-MERGE-TEST-REPORT.md)
- **Developer Guide:** [`apps/engine-demo/src/hardening/README.md`](./apps/engine-demo/src/hardening/README.md)

---

**Testing is automatic. The architecture self-validates.** ✅

**Last Updated:** February 8, 2026
