# DOM Event Handlers Analysis

**Generated:** Phase 0, Step 0.2
**Purpose:** Complete inventory of all DOM event handlers

---

## Summary

- **Input handlers:** 1 in NodeEditor (the main one)
- **KeyDown handlers:** 8 total (1 critical in NodeEditor, 7 in UI components)
- **Composition handlers:** 0 (MISSING - Fix #4 required)
- **BeforeInput handlers:** 0

---

## 1. Input Handlers

### `apps/engine-demo/src/NodeEditor.tsx:664-748`

**Critical - This is THE main typing handler**

```typescript
const handleInput = (e: Event) => {
  const target = e.target as HTMLElement;
  const nodeId = target.getAttribute('data-node-id');

  if (nodeId && editorContainerRef.current?.contains(target)) {
    const cursor = mapDOMSelectionToCursor(window.getSelection()!, nodeId);
    const node = editorState.nodes.find((n) => n.id === nodeId);

    if (node) {
      const inputResult = handleSegmentedInput(node, cursor, target);
      setPendingSegments(nodeId as NodeID, inputResult.node.segments);
    }
  }
};

// Attached globally:
containerEl.addEventListener('input', handleInput);
```

**Purpose:**

- Triggered on EVERY keystroke
- Parses DOM to segments using `handleSegmentedInput`
- Stores in TypingBuffer using `setPendingSegments`

**Why this is the problem:**

- Parsing DOM on every keystroke is expensive
- Segments can become stale between input event and commit
- "Zombie segments" bug originated here

**Replacement in Phase 2:**

- REMOVE this handler entirely
- Let DOM mutate freely (no parsing on input)
- MutationObserver passively watches
- Extract segments ONLY at commit boundaries

**Verification:**

- [ ] After Phase 2, this handler deleted
- [ ] Type a-z → no input handler fires
- [ ] MutationObserver logs mutations instead

---

## 2. KeyDown Handlers

### Critical: `apps/engine-demo/src/NodeEditor.tsx:2508`

**This is THE main keyboard handler**

```typescript
const handleKeyDown = (e: React.KeyboardEvent) => {
  // Handles ALL keyboard operations:
  // - Enter (split)
  // - Backspace (merge)
  // - Arrow keys (navigate)
  // - Tab/Shift+Tab (indent/outdent)
  // - Cmd+shortcuts
  // - etc.
};
```

**Lines involved:** ~1000 lines (huge function)

**Purpose:**

- Central keyboard dispatcher
- Routes to specific operation handlers
- Calls TypingBuffer methods before structural ops

**Replacement in Phase 2:**

- Keep structure of handler
- Replace TypingBuffer calls with DOMObserver calls
- Add composition guards (Fix #4)
- Follow commit boundary contract (Fix #6)

**Specific changes needed:**

**Enter key section** (~line 3000):

```typescript
// OLD:
flushPendingSegments('enter');
const syncResult = handleSegmentedInput(activeNode, liveCursor, activeElement);

// NEW:
const observer = domObservers.current.get(nodeId);
if (observer) observer.stop();
const segments = extractSegmentsFromDOM(element);
```

**Backspace merge section** (~line 3100):

```typescript
// OLD:
setPendingSegments(liveCursor.nodeId, syncResult.node.segments);
stopTyping();
flushPendingSegments('backspace-merge');

// NEW:
const observer = domObservers.current.get(nodeId);
if (observer) {
  observer.stop();
  observer.destroy();
  domObservers.current.delete(nodeId);
}
const segments = extractSegmentsFromDOM(element);
```

**Arrow keys section:**

```typescript
// OLD:
// No explicit typing buffer call (relies on blur)

// NEW:
const observer = domObservers.current.get(currentNodeId);
if (observer) observer.stop();
const segments = extractSegmentsFromDOM(currentElement);
// Update model, then start observer on new node
```

### Non-Critical: UI Component Handlers

These are in UI packages and DON'T use TypingBuffer:

- `AppSidebar.tsx` - Global shortcuts (Cmd+K, etc.)
- `FloatingMenu.tsx` - Menu navigation
- `Checkbox.tsx` - Checkbox keydown
- `PageTitleSection.tsx` - Title input
- `TitleInput.tsx` - Title editing
- `SidebarItem.tsx` - Sidebar navigation
- `TagInput.tsx` - Tag autocomplete

**Action:** No changes needed (don't touch)

---

## 3. Composition Handlers

### ⚠️ CRITICAL FINDING: MISSING

**Current state:** ZERO composition handlers found

**This is Fix #4** - Required before Phase 2

**Must add:**

```typescript
// In NodeEditor.tsx, add state:
const [isComposing, setIsComposing] = useState(false);

// Add handlers:
function handleCompositionStart(nodeId: string) {
  console.log('[Composition] Started');
  setIsComposing(true);
}

function handleCompositionEnd(nodeId: string) {
  console.log('[Composition] Ended');
  setIsComposing(false);
}

// In NodeView render:
<div
  contentEditable
  onCompositionStart={() => handleCompositionStart(node.id)}
  onCompositionEnd={() => handleCompositionEnd(node.id)}
/>

// Guard ALL commit boundaries:
if (isComposing) return;
```

**Verification:**

- [ ] Type Chinese characters → compositionstart fires
- [ ] Select character → compositionend fires
- [ ] Press Enter during composition → blocked
- [ ] Press Backspace during composition → blocked

---

## 4. BeforeInput Handlers

**Current state:** None found

**Good:** BeforeInput is not needed for this architecture.

MutationObserver captures the result, not the intent.

**Action:** No changes needed

---

## 5. Handler Call Graph

```
User Action → Event → Handler → Effect
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Typing:
Type 'a' → input → handleInput → setPendingSegments
  ↓
  (buffer holds 'a')
  ↓
Enter → keydown → handleKeyDown → flushPendingSegments
  ↓                                    ↓
  Split logic                     Read from buffer
  ↓
  Model updated

REPLACEMENT:
Type 'a' → (DOM mutates) → MutationObserver logs
  ↓
  (DOM holds 'a', no buffer)
  ↓
Enter → keydown → handleKeyDown → extractSegmentsFromDOM
  ↓                                    ↓
  Split logic                     Read from DOM
  ↓
  Model updated
```

**Key difference:** No intermediate storage. DOM is source of truth.

---

## 6. Event Attachment Points

### Global Listener (Container-Level)

**Location:** `NodeEditor.tsx:744`

```typescript
containerEl.addEventListener('input', handleInput);
```

**Action:** DELETE in Phase 2 (after proving MutationObserver works)

### Per-Node Listeners (JSX Props)

**Location:** `NodeEditor.tsx:3766, 3823, 3869, etc.`

```typescript
<div
  contentEditable
  onKeyDown={handleKeyDown}  // Keep this
  onBlur={...}               // Keep this
  // onInput NOT here - global handler above
/>
```

**Action:**

- Keep `onKeyDown` (central dispatcher)
- Keep `onBlur` (commit boundary)
- Add `onCompositionStart/End` (Fix #4)

---

## 7. Handler Modification Checklist

**Phase 2 Changes:**

### `NodeEditor.tsx` handleInput function

- [ ] DELETE entire function (lines 664-706)
- [ ] DELETE global listener attachment (line 744)
- [ ] DELETE listener cleanup (line 748)
- [ ] Verify: grep `handleInput` returns ZERO results

### `NodeEditor.tsx` handleKeyDown function

- [ ] ADD composition guard at top (Fix #4)
- [ ] REPLACE Enter handler (lines 3000-3100)
- [ ] REPLACE Backspace handler (lines 3100-3150)
- [ ] ADD observer stop/start for Arrow keys
- [ ] Verify: all structural ops follow commit boundary contract

### Add Composition Handlers

- [ ] ADD state `isComposing`
- [ ] ADD `handleCompositionStart`
- [ ] ADD `handleCompositionEnd`
- [ ] ADD handlers to contentEditable elements
- [ ] Verify: IME input works correctly

---

## 8. Dependencies Between Handlers

### Handler Interdependencies

**Input → KeyDown:**

- Input stores in buffer
- KeyDown reads from buffer
- **Risk:** Timing between them

**KeyDown → Blur:**

- KeyDown may trigger blur (e.g., arrow key to other node)
- Blur flushes buffer
- **Risk:** Double-flush

**Current guards:** `isTyping()` flag prevents conflicts

**New guards:** Observer start/stop state prevents conflicts

---

## 9. Verification Strategy

**After Phase 2, verify:**

```bash
# No more input handler
rg "handleInput.*=" apps/engine-demo/src/NodeEditor.tsx
# Expected: ZERO results (function deleted)

# Composition handlers added
rg "onCompositionStart" apps/engine-demo/src/NodeEditor.tsx
# Expected: Multiple results (all contentEditable elements)

# All keydown ops follow contract
rg "if \(isComposing\) return" apps/engine-demo/src/NodeEditor.tsx
# Expected: Enter, Backspace, Arrow, Blur handlers
```

**Manual verification:**

- [ ] Type normally → works (no input handler)
- [ ] Enter key → works (reads fresh DOM)
- [ ] Backspace → works (reads fresh DOM)
- [ ] IME input → works (composition guards)

---

END OF DOM HANDLERS ANALYSIS
