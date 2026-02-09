# TypingBuffer Usage Analysis

**Generated:** Phase 0, Step 0.1
**Purpose:** Complete inventory of all TypingBuffer dependencies

---

## Summary

- **Files importing TypingBuffer:** 8 files
- **Direct method calls:** 5 different methods
- **isTyping() checks:** 10 locations
- **startTyping/stopTyping calls:** 4 locations
- **setPendingSegments calls:** 2 locations
- **getPendingSegments calls:** 3 locations
- **flushPendingSegments calls:** 3 locations

---

## 1. Files Importing TypingBuffer

### Core Files

#### `apps/engine-demo/src/editor/TypingBuffer.ts`

- **Type:** Implementation file (singleton)
- **Exports:** `isTyping()`, `startTyping()`, `stopTyping()`, `setPendingSegments()`, `getPendingSegments()`, `clearAllPendingSegments()`, `getAllPendingNodeIds()`, `hasPendingChanges()`
- **Action:** Will be DELETED in Phase 3

#### `apps/engine-demo/src/editor/TypingBuffer.v2.ts`

- **Type:** Instance-based version
- **Exports:** Class `TypingBuffer` with instance methods
- **Action:** Will be DELETED in Phase 3

#### `apps/engine-demo/src/editor/index.ts`

- **Type:** Barrel export
- **Re-exports:** All TypingBuffer functions
- **Action:** Remove exports in Phase 3

### Enforcement Layer Files

#### `apps/engine-demo/src/enforcement/invariants.ts`

- **Line 17:** `import { isTyping, hasPendingChanges } from '../editor/TypingBuffer'`
- **Usage:**
  - Line 76: `if (isTyping())` - guard for direct model access
  - Line 97: `if (isTyping() && hasPendingChanges(nodeId))` - prevent data loss
  - Line 182: `if (isTyping()) return;` - skip validation during typing
- **Purpose:** Prevent model mutations during typing
- **Action:** Remove `isTyping()` checks in Phase 3 (MutationObserver makes them unnecessary)

#### `apps/engine-demo/src/enforcement/SingleWritePipeline.ts`

- **Line 19:** `import { isTyping } from '../editor/TypingBuffer'`
- **Usage:**
  - Line 68: `if (isTyping())` - prevent direct setState during typing
- **Purpose:** Enforce pipeline usage
- **Action:** Remove check in Phase 3

#### `apps/engine-demo/src/enforcement/SelectionIntent.ts`

- **Line 19:** `import { isTyping } from '../editor/TypingBuffer'`
- **Usage:**
  - Line 55: `if (isTyping())` - skip read-only intent during typing
  - Line 124: `if (isTyping() || isPipelineLocked())` - combined guard
- **Purpose:** Prevent selection changes during typing
- **Action:** Remove checks in Phase 3

#### `apps/engine-demo/src/enforcement/CursorInvariants.ts`

- **Line 13:** `import { isTyping } from '../editor/TypingBuffer'`
- **Usage:**
  - Line 110: `if (isTyping()) return;` - skip cursor validation during typing
- **Purpose:** Allow cursor divergence during typing
- **Action:** Remove check in Phase 3

#### `apps/engine-demo/src/enforcement/CommitPipeline.ts`

- **Line 22-26:** Imports `stopTyping`, `getPendingSegments`
- **Usage:**
  - Line 90: `getPendingSegments(node.id)` - get pending data
  - Line 162: `stopTyping()` - mark typing ended
- **Purpose:** Flush typing buffer before commit
- **Action:** Replace with DOM extraction in Phase 2

#### `apps/engine-demo/src/enforcement/CommitPipeline.v2.ts`

- **Line 13:** `import type { TypingBuffer } from '../editor/TypingBuffer.v2'`
- **Usage:**
  - Line 37: Log instance ID
  - Line 83: `stopTyping()`
  - Line 194: `getAllPendingNodeIds()`
  - Line 208: `getPendingSegments(node.id)`
  - Line 216: `clearAllPendingSegments()`
- **Purpose:** Instance-based commit pipeline
- **Action:** Replace with DOMObserver in Phase 2

### Main Component

#### `apps/engine-demo/src/NodeEditor.tsx`

- **Line 97-110:** Imports ALL typing buffer functions
- **Usage:** (Most critical file)
  - Line 550: `if (isTyping())` - guard in effect manager
  - Line 698: `setPendingSegments()` - store input result
  - Line 722: `stopTyping()` - on blur
  - Line 726: `flushPendingSegments('blur')` - flush on blur
  - Line 761: Function definition `flushPendingSegments()`
  - Line 786: `getPendingSegments()` - read pending data
  - Line 805: `if (isTyping() && getAllPendingNodeIds().length > 0)` - debounce guard
  - Line 812: `stopTyping()` - in debounce
  - Line 815: `flushPendingSegments('debounce')` - flush debounced
  - Line 859: `if (__DEV__ && isTyping())` - dev assertion in commit
  - Line 3121: `setPendingSegments()` - in Backspace handler
  - Line 3129: `flushPendingSegments('backspace-merge')` - flush before merge
- **Purpose:** Main editor component - all typing logic
- **Action:** Replace with DOMObserver in Phase 2 (most work here)

---

## 2. Method Usage Analysis

### `isTyping()` - 10 occurrences

**Purpose:** Check if user is currently typing (DOM-owned state)

**All locations:**

1. `invariants.ts:76` - Guard direct model access
2. `invariants.ts:97` - Prevent data loss during typing
3. `invariants.ts:182` - Skip validation during typing
4. `SingleWritePipeline.ts:68` - Prevent setState during typing
5. `SelectionIntent.ts:55` - Skip intent tracking during typing
6. `SelectionIntent.ts:124` - Combined guard with pipeline lock
7. `CursorInvariants.ts:110` - Skip cursor validation during typing
8. `NodeEditor.tsx:550` - Effect manager guard
9. `NodeEditor.tsx:805` - Debounce guard
10. `NodeEditor.tsx:859` - Dev assertion in commit

**Pattern:** Always used as a guard - `if (isTyping()) return/skip/error`

**Replacement:** Will be removed. MutationObserver start/stop state replaces this.

### `startTyping()` / `stopTyping()` - 4 locations

**Purpose:** Manually set typing state

**All locations:**

1. `TypingBuffer.ts:52,60` - Implementation
2. `TypingBuffer.v2.ts:44,51` - Instance version
3. `NodeEditor.tsx:722` - stopTyping on blur
4. `NodeEditor.tsx:812` - stopTyping in debounce
5. `NodeEditor.tsx:3126` - stopTyping in Backspace
6. `CommitPipeline.ts:162` - stopTyping before commit
7. `CommitPipeline.v2.ts:83` - stopTyping in instance version

**Pattern:** Always paired with flush or commit

**Replacement:** Observer.stop() / Observer.start()

### `setPendingSegments()` - 2 locations

**Purpose:** Store parsed segments in buffer

**All locations:**

1. `NodeEditor.tsx:698` - After input event (normal typing)
2. `NodeEditor.tsx:3121` - Before Backspace merge (sync DOM first)

**Pattern:** Always after parsing DOM with `handleSegmentedInput`

**Replacement:** Not needed - segments extracted directly at commit boundaries

### `getPendingSegments()` - 3 locations

**Purpose:** Read buffered segments

**All locations:**

1. `CommitPipeline.ts:90` - Read pending data before commit
2. `CommitPipeline.v2.ts:208` - Instance version
3. `NodeEditor.tsx:786` - In flushPendingSegments function

**Pattern:** Always before model update

**Replacement:** `extractSegmentsFromDOM(element)` at commit boundaries

### `flushPendingSegments()` - 3 locations

**Purpose:** Move buffered segments to model

**All locations:**

1. `NodeEditor.tsx:726` - On blur
2. `NodeEditor.tsx:815` - On debounce
3. `NodeEditor.tsx:3129` - Before Backspace merge

**Pattern:** Always before structural operations

**Replacement:** Direct `extractSegmentsFromDOM` + model update at boundaries

---

## 3. Hot Path Analysis

### Critical Path: Normal Typing

```
User types → input event → handleSegmentedInput →
setPendingSegments → (buffer holds data) →
eventual flush → model update
```

**Files involved:**

- `NodeEditor.tsx:664` - input handler
- `NodeEditor.tsx:698` - setPendingSegments call

**Replacement in Phase 2:**

- Remove input handler's `setPendingSegments` call
- Let DOM mutate freely
- Extract only at commit boundaries

### Critical Path: Enter Key

```
Enter pressed → flushPendingSegments →
sync DOM again → performGuaranteedSplit →
model update → commit
```

**Files involved:**

- `NodeEditor.tsx:2508` - handleKeyDown
- `NodeEditor.tsx:3000-3100` - Enter handler

**Replacement in Phase 2:**

- Stop observer
- Extract segments from DOM
- Split with fresh segments
- Commit
- Restart observer

### Critical Path: Backspace Merge

```
Backspace at start → sync DOM → setPendingSegments →
stopTyping → flushPendingSegments →
merge logic → commit
```

**Files involved:**

- `NodeEditor.tsx:3100-3150` - Backspace handler

**Replacement in Phase 2:**

- Stop observers (both nodes)
- Extract segments from both DOMs
- Merge segments
- Commit
- Restart observer

### Critical Path: Blur

```
Focus leaves → stopTyping → flushPendingSegments →
commit
```

**Files involved:**

- `NodeEditor.tsx:720-730` - blur handler

**Replacement in Phase 2:**

- Stop observer
- Extract segments from DOM
- Commit
- (Don't restart - node no longer active)

---

## 4. Risk Assessment

### High Risk (Will Break Without Replacement)

1. **`NodeEditor.tsx:698`** - Input handler sets pending segments
   - **Risk:** If removed without replacement, typing won't update model
   - **Mitigation:** MutationObserver tracks changes passively
   - **Verify:** Type in node, check observer fires

2. **`NodeEditor.tsx:761`** - flushPendingSegments function
   - **Risk:** Deleted too early, commit boundaries break
   - **Mitigation:** Replace all calls with `extractSegmentsFromDOM` first
   - **Verify:** All 3 call sites replaced before deletion

3. **`NodeEditor.tsx:859`** - Commit guard `if (isTyping())`
   - **Risk:** Removing guard allows commit during typing
   - **Mitigation:** MutationObserver stop/start prevents this structurally
   - **Verify:** Commit can't be called while observer is running

### Medium Risk (Might Break Edge Cases)

1. **Enforcement layer `isTyping()` guards**
   - **Risk:** Removing guards allows operations during typing
   - **Mitigation:** Observer lifecycle prevents concurrent operations
   - **Verify:** All enforcement tests still pass

2. **Debounce logic** (`NodeEditor.tsx:805-815`)
   - **Risk:** Debounced flush might not work with observer
   - **Mitigation:** Observer accumulates mutations, flush reads DOM
   - **Verify:** Type fast, wait, check model updated

### Low Risk (Independent Code)

1. **UI package files** - Don't use TypingBuffer (false positives in grep)
2. **CommitPipeline.v2.ts** - Instance version, parallel to main version
3. **Export index files** - Simple re-exports

---

## 5. Deletion Checklist

**Phase 3 - Delete these functions:**

From `TypingBuffer.ts`:

- [ ] `isTyping()`
- [ ] `startTyping()`
- [ ] `stopTyping()`
- [ ] `setPendingSegments()`
- [ ] `getPendingSegments()`
- [ ] `clearAllPendingSegments()`
- [ ] `getAllPendingNodeIds()`
- [ ] `hasPendingChanges()`

From `TypingBuffer.v2.ts`:

- [ ] Entire class

From `NodeEditor.tsx`:

- [ ] Import lines 97-110
- [ ] Function `flushPendingSegments` (line 761)
- [ ] All calls to above functions

From Enforcement files:

- [ ] All `isTyping()` imports
- [ ] All `isTyping()` checks

**Verify before deletion:**

```bash
# Should return ZERO results after Phase 2:
rg "typingBuffer\." --type ts
rg "isTyping\(\)" --type ts
rg "flushPendingSegments" --type ts
rg "setPendingSegments" --type ts
rg "getPendingSegments" --type ts
```

---

## 6. Unknown/Unexpected Dependencies

**None found.** All usages are in expected locations (NodeEditor, enforcement, commit pipeline).

**No surprises.**

---

## 7. Hot Path Priority for Phase 2

Replace in this order (lowest to highest risk):

1. **Blur** - Simple, no structural changes
2. **Arrow keys** - Node change boundary
3. **Debounce** - Background flush
4. **Enter key** - Most complex, split operation
5. **Backspace merge** - Second most complex

---

END OF TYPING BUFFER USAGE ANALYSIS
