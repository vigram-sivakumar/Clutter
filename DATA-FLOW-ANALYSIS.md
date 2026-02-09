# Data Flow Analysis - Current vs New Architecture

**Generated:** Phase 0, Step 0.3
**Purpose:** Map complete data flow through editor

---

## Current Architecture (TypingBuffer)

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER TYPES 'a'                          │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Browser mutates DOM                          │
│                  <div>a</div>                                   │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              'input' event fires                                │
│         (NodeEditor.tsx:664)                                    │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│         handleInput() reads DOM                                 │
│    target.textContent + childNodes                              │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│    handleSegmentedInput() parses DOM                            │
│    Converts to: [{ type: 'text', text: 'a' }]                  │
│         (SegmentedEditor.ts)                                    │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│      setPendingSegments(nodeId, segments)                       │
│      Stores in TypingBuffer (in-memory)                         │
│         (NodeEditor.tsx:698)                                    │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                    [SEGMENTS IN BUFFER]
                    (Can become stale!)
                               │
                               │
              ╔════════════════╧════════════════╗
              ║    USER PRESSES ENTER          ║
              ╚════════════════╤════════════════╝
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│     flushPendingSegments('enter')                               │
│     Reads from buffer                                           │
│         (NodeEditor.tsx:761)                                    │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│   Sync DOM AGAIN (paranoia check)                               │
│   handleSegmentedInput() re-parses                              │
│         (Enter handler)                                         │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│   performGuaranteedSplit(node, cursor)                          │
│   Splits segments into [head, tail]                             │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│   Update model.nodes (index-based)                              │
│   nodes.splice(index, 1, head, tail)                            │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              commit('enter')                                    │
│         React setState triggered                                │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│           React re-renders nodes                                │
│      (NodeView components update)                               │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│     requestCaretPlacement()                                     │
│   Places cursor in new node                                     │
└─────────────────────────────────────────────────────────────────┘
```

**Problems:**

1. **Double parsing** - DOM parsed on input, then again on Enter
2. **Stale segments** - Buffer can diverge from DOM between input and commit
3. **Zombie segments** - Deleted text lingers in buffer
4. **isTyping() flag** - Manual state tracking prone to corruption

---

## New Architecture (MutationObserver)

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER TYPES 'a'                          │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Browser mutates DOM                          │
│                  <div>a</div>                                   │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│         MutationObserver fires (passive)                        │
│    Logs mutation to pendingMutations                            │
│    (for diagnostics only - NOT used for state)                  │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                         [DOM OWNS 'a']
                    (No intermediate buffer)
                               │
                               │
              ╔════════════════╧════════════════╗
              ║    USER PRESSES ENTER          ║
              ╚════════════════╤════════════════╝
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│     COMPOSITION GUARD (Fix #4)                                  │
│     if (isComposing) return;                                    │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│         observer.stop()                                         │
│    Stop watching (commit boundary started)                      │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│   extractSegmentsFromDOM(element)                               │
│   Parse DOM ONCE (fresh data, no staleness)                    │
│         (DOMObserver.ts)                                        │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│   Read fresh selection                                          │
│   window.getSelection() (Fix #1)                                │
│   NEVER infer from mutations                                    │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│   Update node.segments with fresh data                          │
│   node.segments = segments                                      │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│   performGuaranteedSplit(node, cursor)                          │
│   Splits with fresh segments (no staleness)                     │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│   Update model.nodes (index-based)                              │
│   nodes.splice(index, 1, head, tail)                            │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              commit('enter')                                    │
│         React setState triggered                                │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│      observer.clearPendingMutations()                           │
│    Clear diagnostic data (Fix #2)                               │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│           React re-renders nodes                                │
│      (NodeView components update)                               │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│     Read cursor from DOM (Fix #3)                               │
│   NOT from naive segment.length calc                            │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│     requestCaretPlacement()                                     │
│   Places cursor in new node                                     │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│     observer.start()                                            │
│   Resume watching new node                                      │
└─────────────────────────────────────────────────────────────────┘
```

**Benefits:**

1. **Single parse** - DOM parsed once at commit, not on every keystroke
2. **No staleness** - Always reading fresh DOM
3. **No zombie data** - No intermediate buffer to hold stale data
4. **Structural lifecycle** - Observer start/stop replaces isTyping() flag

---

## Transformation Points

### 1. Text → Segments (Current)

**Where:** `handleSegmentedInput()` in `SegmentedEditor.ts`

**When:** On EVERY input event (every keystroke)

**How:**

```typescript
// Walk DOM childNodes
for (const child of element.childNodes) {
  if (child.nodeType === TEXT_NODE) {
    segments.push({ type: 'text', text: child.textContent });
  } else if (isInlineElement(child)) {
    segments.push({ type: 'inline', ... });
  }
}
```

**Problem:** Called too often, can produce stale data

### 1. Text → Segments (New)

**Where:** `extractSegmentsFromDOM()` in `DOMObserver.ts`

**When:** ONLY at commit boundaries (Enter, Backspace, Blur, Arrow)

**How:** Same algorithm, but called less frequently

**Benefit:** No staleness, single source of truth

---

### 2. Segments → Text (Unchanged)

**Where:** `renderSegments()` in rendering

**When:** On React render

**How:**

```typescript
segments.map(seg => {
  if (seg.type === 'text') return seg.text;
  if (seg.type === 'inline') return <InlineRef id={seg.id} />;
});
```

**Status:** No changes needed (this is fine)

---

### 3. DOM Selection → Cursor (Unchanged)

**Where:** `mapDOMSelectionToCursor()` in `domMapping.ts`

**When:** At all commit boundaries

**How:**

```typescript
const range = selection.getRangeAt(0);
const { segmentIndex, offset } = findSegmentPosition(range);
return { nodeId, segmentIndex, offset };
```

**Status:** No changes needed (already correct)

**Fix #1:** Explicitly document that this is ALWAYS used, never inferred from mutations

---

### 4. Cursor → DOM (Unchanged)

**Where:** `requestCaretPlacement()` / `CaretPlacement.ts`

**When:** After structural operations

**How:**

```typescript
const range = createRangeFromCursor(cursor);
selection.removeAllRanges();
selection.addRange(range);
```

**Status:** No changes needed (already correct)

---

## Commit Boundaries (Where Extraction Happens)

### Identified Boundaries

1. **Enter key** (`NodeEditor.tsx:3185`)
   - Current: `flushPendingSegments('enter')`
   - New: `extractSegmentsFromDOM(element)`
   - Frequency: User-driven (every Enter press)

2. **Backspace merge** (`NodeEditor.tsx:3102`)
   - Current: `setPendingSegments` + `flushPendingSegments('backspace-merge')`
   - New: `extractSegmentsFromDOM(element)` for BOTH nodes
   - Frequency: User-driven (Backspace at node start)

3. **Blur** (`NodeEditor.tsx:714`)
   - Current: `flushPendingSegments('blur')`
   - New: `extractSegmentsFromDOM(element)`
   - Frequency: User-driven (clicking outside)

4. **Arrow keys** (node change)
   - Current: Implicit (blur handles it)
   - New: Explicit stop/extract/start
   - Frequency: User-driven (arrow navigation)

5. **Debounce** (`NodeEditor.tsx:815`)
   - Current: `flushPendingSegments('debounce')`
   - New: `extractSegmentsFromDOM(element)`
   - Frequency: Automatic (2s after typing stops)

### Non-Boundaries (Normal Typing)

**These do NOT trigger extraction:**

- Regular typing (a-z, 0-9, etc.)
- Backspace in middle of text
- Delete key
- Arrow left/right (within node)
- Selection changes

**Why:** DOM owns these operations. No structural changes.

---

## State Synchronization Points

### Current Flow: Bidirectional Sync (Fragile)

```
┌───────────┐          ┌──────────────┐          ┌─────────┐
│    DOM    │ ────────▶│ TypingBuffer │ ────────▶│  Model  │
│  (mutable)│          │  (volatile)  │          │ (state) │
│           │◀──────── │              │◀──────── │         │
└───────────┘   render └──────────────┘   flush  └─────────┘
     │                        │                        │
     │                        │                        │
     └─── input event ────────┤                        │
                              │                        │
                              └─── commit boundary ────┘
```

**Problems:**

- Three sources of truth (DOM, buffer, model)
- Sync in both directions (complex)
- Buffer can diverge (staleness)
- Race conditions between sync points

### New Flow: Unidirectional (Robust)

```
┌───────────┐                              ┌─────────┐
│    DOM    │ ───────────────────────────▶│  Model  │
│  (mutable)│    extractSegmentsFromDOM    │ (state) │
│           │◀─────────────────────────────│         │
└───────────┘           render             └─────────┘
     │                                          │
     │                                          │
     └─────── commit boundary ─────────────────┘
          (Enter, Backspace, Blur, etc.)


┌──────────────────┐
│ MutationObserver │  (passive watcher)
│   (diagnostic)   │  logs mutations
└──────────────────┘  NOT used for state
```

**Benefits:**

- Two sources of truth (DOM during typing, model after commit)
- Sync in one direction (DOM → model at boundaries)
- No intermediate buffer (no divergence possible)
- No race conditions (extraction is atomic)

---

## Timing Analysis

### Current: When Segments Are Parsed

| Event       | Parse Count  | Purpose                       |
| ----------- | ------------ | ----------------------------- |
| Type 'a'    | 1            | Input handler → buffer        |
| Type 'b'    | 1            | Input handler → buffer        |
| Type 'c'    | 1            | Input handler → buffer        |
| Press Enter | 2            | Flush buffer + sync DOM again |
| **Total**   | **5 parses** | **3 to buffer + 2 on commit** |

### New: When Segments Are Parsed

| Event       | Parse Count | Purpose                 |
| ----------- | ----------- | ----------------------- |
| Type 'a'    | 0           | DOM mutates, no parsing |
| Type 'b'    | 0           | DOM mutates, no parsing |
| Type 'c'    | 0           | DOM mutates, no parsing |
| Press Enter | 1           | Extract from DOM once   |
| **Total**   | **1 parse** | **Only on commit**      |

**Performance gain:** 80% fewer DOM parses

---

## Race Condition Analysis

### Current: Input vs Commit Race

```
Timeline:
t=0ms:   User types 'a'
t=1ms:   Input event fires
t=2ms:   handleSegmentedInput parses DOM
t=3ms:   setPendingSegments stores [{ text: 'a' }]
t=10ms:  User types 'b'
t=11ms:  Input event fires
t=12ms:  handleSegmentedInput parses DOM
t=13ms:  setPendingSegments stores [{ text: 'ab' }]
t=15ms:  User backspaces (deletes 'b')
t=16ms:  Input event fires
t=17ms:  handleSegmentedInput parses DOM
t=18ms:  setPendingSegments stores [{ text: 'a' }]
t=20ms:  User presses Enter (before next input event)
t=21ms:  flushPendingSegments reads buffer → [{ text: 'a' }]
t=22ms:  Sync DOM again → actually shows 'a' ✓
```

**If sync was skipped at t=22ms:**

- Split would use stale 'ab' from buffer
- But DOM shows 'a' (backspace happened)
- **Result:** Zombie 'b' in one of the nodes

**Current mitigation:** Paranoia sync at t=22ms

### New: No Race Possible

```
Timeline:
t=0ms:   User types 'a'
t=1ms:   Browser mutates DOM
t=2ms:   MutationObserver logs (diagnostic only)
t=10ms:  User types 'b'
t=11ms:  Browser mutates DOM
t=12ms:  MutationObserver logs (diagnostic only)
t=15ms:  User backspaces (deletes 'b')
t=16ms:  Browser mutates DOM
t=17ms:  MutationObserver logs (diagnostic only)
t=20ms:  User presses Enter
t=21ms:  observer.stop() - freeze state
t=22ms:  extractSegmentsFromDOM(element) - read fresh DOM → 'a' ✓
t=23ms:  Split uses fresh segments
```

**No intermediate buffer = no staleness possible**

**DOM is always authoritative**

---

## Memory Layout

### Current: Three Copies of Data

```
┌──────────────────────┐
│ DOM (contentEditable)│
│ "Hello @ref world"   │
└──────────────────────┘
         │
         │ (parsed on input)
         ▼
┌──────────────────────┐
│   TypingBuffer       │
│ [                    │
│   { text: 'Hello ' },│
│   { inline: 'ref' }, │
│   { text: ' world' } │
│ ]                    │
└──────────────────────┘
         │
         │ (flushed on commit)
         ▼
┌──────────────────────┐
│   Model (state)      │
│ node.segments = [    │
│   { text: 'Hello ' },│
│   { inline: 'ref' }, │
│   { text: ' world' } │
│ ]                    │
└──────────────────────┘
```

**Memory:** 3x data during typing

### New: Two Copies of Data

```
┌──────────────────────┐
│ DOM (contentEditable)│
│ "Hello @ref world"   │
└──────────────────────┘
         │
         │ (extracted only at commit)
         ▼
┌──────────────────────┐
│   Model (state)      │
│ node.segments = [    │
│   { text: 'Hello ' },│
│   { inline: 'ref' }, │
│   { text: ' world' } │
│ ]                    │
└──────────────────────┘

┌──────────────────────┐
│ MutationObserver     │
│ pendingMutations = [ │
│   { type: 'charData' │
│     ...diagnostic    │
│   }                  │
│ ]                    │
│ (NOT used for state) │
└──────────────────────┘
```

**Memory:** 2x data (50% reduction in typing state)

---

## Code Complexity

### Current: Lines of Code

| Component            | Lines          | Purpose               |
| -------------------- | -------------- | --------------------- |
| TypingBuffer.ts      | 130            | Singleton buffer      |
| TypingBuffer.v2.ts   | 90             | Instance version      |
| handleSegmentedInput | 100            | Parse DOM on input    |
| flushPendingSegments | 50             | Buffer → model        |
| isTyping() guards    | 10x            | Scattered checks      |
| **Total**            | **~400 lines** | **Buffer management** |

### New: Lines of Code

| Component              | Lines          | Purpose               |
| ---------------------- | -------------- | --------------------- |
| DOMObserver.ts         | 120            | Observer + extract    |
| extractSegmentsFromDOM | 50             | Parse DOM on commit   |
| Commit boundaries      | 200            | Extract + update      |
| **Total**              | **~370 lines** | **Direct extraction** |

**Reduction:** ~30 lines fewer, but more importantly:

- No dual paths (input vs commit)
- No sync logic (unidirectional)
- No flag management (observer state)

---

## Performance Characteristics

### Current: Parse on Every Keystroke

```
Action:        Type  Type  Type  Enter
Parse count:     1     1     1     2
Time per parse: 1ms   1ms   1ms   1ms (sync) + 1ms (buffer)
Total time:     1ms   1ms   1ms   2ms
Cumulative:     1ms   2ms   3ms   5ms
```

**Cost:** O(n) per keystroke, where n = content length

### New: Parse Only on Commit

```
Action:        Type  Type  Type  Enter
Parse count:     0     0     0     1
Time per parse:  0     0     0    1ms (fresh DOM)
Total time:      0     0     0    1ms
Cumulative:      0     0     0    1ms
```

**Cost:** O(n) only on commit, where n = content length

**Speedup:** 5x fewer parses in typical use (type 3 chars + Enter)

---

## Edge Cases Handled

### Rapid Operations

**Scenario:** User types "abc" then IMMEDIATELY presses Enter (no debounce)

**Current:**

1. Input 'a' → parse → buffer ['a']
2. Input 'b' → parse → buffer ['ab']
3. Input 'c' → parse → buffer ['abc']
4. Enter → flush buffer ['abc'] → sync DOM → split

**Risk:** If Enter happens before input 'c' processes, buffer has ['ab'] but DOM shows 'abc'

**Mitigation:** Sync DOM again at step 4

**New:**

1. Type 'a' → DOM mutates → no parse
2. Type 'b' → DOM mutates → no parse
3. Type 'c' → DOM mutates → no parse
4. Enter → stop observer → extract from DOM ['abc'] → split

**Risk:** None. DOM is always fresh.

### Browser Autocomplete

**Scenario:** User types "hel", browser suggests "hello", user accepts

**Current:**

- Autocomplete mutates DOM directly
- Input event fires
- handleSegmentedInput parses "hello"
- Buffer stores "hello"
- ✓ Works correctly

**New:**

- Autocomplete mutates DOM directly
- MutationObserver logs (diagnostic)
- No parsing until commit boundary
- Enter/Blur → extract "hello" from DOM
- ✓ Works correctly

**Both architectures handle this correctly**

---

## Critical Fix Integration Points

### Fix #1: Selection Invariant

**Where integrated:**

- `DOMObserver.ts` header comment
- `EDITOR-ARCHITECTURE.md` invariants section
- All commit boundaries explicitly call `window.getSelection()`

### Fix #2: Batching Non-Authoritative

**Where integrated:**

- `DOMObserver.ts` `pendingMutations` JSDoc
- `clearPendingMutations()` called after every commit
- No logic branches on mutation contents

### Fix #3: Cursor Offset for Inline Segments

**Where integrated:**

- Backspace merge handler
- Replace naive `reduce((sum, seg) => sum + ... : 1)`
- Read cursor from DOM after render, not before

### Fix #4: Composition Guards

**Where integrated:**

- `isComposing` state in NodeEditor
- `onCompositionStart/End` handlers on contentEditable
- Guard at START of all commit boundaries

### Fix #5: Observer Lifecycle

**Where integrated:**

- `observer.destroy()` on node deletion
- Backspace merge destroys current node's observer
- Delete operations destroy observer before model update

### Fix #6: Commit Boundary Contract

**Where integrated:**

- `COMMIT-BOUNDARY-CONTRACT.md` document
- Code comments reference contract
- All handlers follow 10-step pattern

---

END OF DATA FLOW ANALYSIS
