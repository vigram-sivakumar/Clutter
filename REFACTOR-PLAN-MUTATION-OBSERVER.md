# REFACTOR PLAN: MutationObserver-Based Architecture

## SCOPE ASSESSMENT

**Files Analyzed:** 59 total files (53 `.ts`, 6 `.tsx`)

**Files That MUST Change:**
1. ✅ `NodeEditor.tsx` (4,473 lines) - Add MutationObserver, remove TypingBuffer
2. ✅ `TypingBuffer.ts` - **DELETE** (270 lines)
3. ✅ `SegmentedEditor.ts` - Simplify to boundary-only operations
4. ✅ `CommitPipeline.ts` - Remove `isTyping()` checks
5. ⚠️ `NodeView.tsx` - Keep simple, ensure no input handling

**Files That MAY Change:**
- `domMapping.ts` - Might simplify (no stale cursor mapping)
- `split-state-machine.ts` - Keep as-is (pure logic)
- `EditorModel.index.ts` - Keep as-is (data structure)
- Enforcement files - Remove `isTyping()` guards

**Files That WON'T Change:**
- All `/engine/` files (data types)
- All `/ui/` files (persistence, grammar)
- All `/input/` files (parsing)
- All `/commands/` files (operations)

---

## CHANGE SIZE ESTIMATE

| Category | Lines to Delete | Lines to Add | Net Change |
|----------|----------------|--------------|------------|
| TypingBuffer | -270 | 0 | -270 |
| NodeEditor | -500 | +300 | -200 |
| SegmentedEditor | -200 | +50 | -150 |
| MutationObserver | 0 | +200 | +200 |
| Enforcement cleanup | -100 | 0 | -100 |
| **TOTAL** | **-1,070** | **+550** | **-520** |

**Net Result:** ~520 lines DELETED, simpler codebase

---

## PHASE-BY-PHASE PLAN

### PHASE 0: BACKUP & PREPARATION (5 min)
```bash
# Create safety branch
git checkout -b refactor/mutation-observer-backup
git add -A
git commit -m "Backup before MutationObserver refactor"

# Create working branch
git checkout -b refactor/mutation-observer
```

### PHASE 1: ADD MUTATION OBSERVER (30 min)

**New file:** `src/editor/DOMObserver.ts`

```typescript
/**
 * MutationObserver-based DOM monitoring
 * 
 * PHILOSOPHY:
 * - DOM is source of truth during typing
 * - Observer watches for changes passively
 * - Segments extracted ONLY at boundaries
 */

export class DOMObserver {
  private observer: MutationObserver;
  private isObserving = false;
  
  constructor(private onMutation: (mutations: MutationRecord[]) => void) {
    this.observer = new MutationObserver(this.handleMutations);
  }
  
  observe(element: HTMLElement) {
    if (this.isObserving) return;
    
    this.observer.observe(element, {
      childList: true,
      characterData: true,
      subtree: true,
      characterDataOldValue: true,
    });
    
    this.isObserving = true;
  }
  
  pause() {
    this.observer.disconnect();
    this.isObserving = false;
  }
  
  resume(element: HTMLElement) {
    this.observe(element);
  }
  
  private handleMutations = (mutations: MutationRecord[]) => {
    // Just notify, don't process
    this.onMutation(mutations);
  };
  
  destroy() {
    this.observer.disconnect();
  }
}

/**
 * Extract segments from DOM (called ONLY at boundaries)
 */
export function extractSegmentsFromDOM(element: HTMLElement): Segment[] {
  const segments: Segment[] = [];
  
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || '';
      if (text) {
        segments.push({ type: 'text', text });
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      
      if (el.classList.contains('inline-element')) {
        const inlineId = el.getAttribute('data-inline-id');
        const kind = el.classList.contains('inline-ref') ? 'ref' : 'unknown';
        
        if (inlineId) {
          segments.push({
            type: 'inline',
            kind,
            id: inlineId,
            payload: { type: 'reference', targetId: inlineId },
          });
        }
      }
      // Skip caret-anchors - they're chrome only
    }
  }
  
  return segments;
}
```

**Test file:** `src/editor/__tests__/DOMObserver.test.ts`

```typescript
describe('DOMObserver', () => {
  it('should observe DOM mutations', () => {
    const mutations: MutationRecord[] = [];
    const observer = new DOMObserver((m) => mutations.push(...m));
    
    const el = document.createElement('div');
    el.contentEditable = 'true';
    observer.observe(el);
    
    el.textContent = 'hello';
    
    // Wait for observer
    setTimeout(() => {
      expect(mutations.length).toBeGreaterThan(0);
    }, 0);
  });
  
  it('should extract segments from DOM', () => {
    const el = document.createElement('div');
    el.innerHTML = `
      Hello
      <span class="inline-element inline-ref" data-inline-id="node-1">@ref</span>
      World
    `;
    
    const segments = extractSegmentsFromDOM(el);
    
    expect(segments).toEqual([
      { type: 'text', text: 'Hello' },
      { type: 'inline', kind: 'ref', id: 'node-1', payload: { type: 'reference', targetId: 'node-1' } },
      { type: 'text', text: 'World' },
    ]);
  });
});
```

### PHASE 2: UPDATE NODEEDITOR (60 min)

**Changes to `NodeEditor.tsx`:**

```typescript
// REMOVE all TypingBuffer imports
- import { 
-   isTyping, startTyping, stopTyping, 
-   setPendingSegments, getPendingSegments,
-   flushPendingSegments, ...
- } from './editor/TypingBuffer';

// ADD DOMObserver
+ import { DOMObserver, extractSegmentsFromDOM } from './editor/DOMObserver';

// REMOVE typing state
- const [isUserTyping, setIsUserTyping] = useState(false);

// ADD observer ref
+ const observerRef = useRef<DOMObserver | null>(null);

// SETUP observer (in useEffect)
+ useEffect(() => {
+   const observer = new DOMObserver((mutations) => {
+     // Just log for now, don't process during typing
+     console.log('DOM mutated:', mutations.length, 'changes');
+   });
+   
+   observerRef.current = observer;
+   
+   return () => observer.destroy();
+ }, []);

// REMOVE handleSegmentedInput from input event
- const handleInput = (e: Event) => {
-   const result = handleSegmentedInput(...);
-   setPendingSegments(nodeId, result.segments);
- };

// KEEP input event simple
+ const handleInput = (e: Event) => {
+   // DOM is already updated by browser
+   // Observer watches, we do nothing
+   console.log('Input event (DOM-owned)');
+ };

// UPDATE Enter handler
  case 'Enter': {
    e.preventDefault();
    
+   // PAUSE observer during structural operation
+   observerRef.current?.pause();
+   
    const cursor = modelRef.current!.getCursor();
    const index = cursor.index;
    const nodes = modelRef.current!.getNodes();
    const activeNode = nodes[index];
    
+   // EXTRACT segments from CURRENT DOM
+   const nodeElement = document.querySelector(`[data-node-id="${activeNode.id}"]`);
+   if (!nodeElement) throw new Error('Node element not found');
+   
+   const freshSegments = extractSegmentsFromDOM(nodeElement as HTMLElement);
+   const nodeWithFreshSegments = { ...activeNode, segments: freshSegments };
    
    // Split using FRESH segments
-   const enterResult = handleSegmentedEnter(activeNode, cursor);
+   const enterResult = handleSegmentedEnter(nodeWithFreshSegments, cursor);
    
    // ... rest of Enter logic ...
    
+   // RESUME observer after structural operation
+   requestAnimationFrame(() => {
+     observerRef.current?.resume(containerElement);
+   });
  }

// UPDATE Backspace handler similarly
  case 'Backspace': {
+   observerRef.current?.pause();
+   
    // Extract fresh segments
+   const freshSegments = extractSegmentsFromDOM(activeNodeElement);
    
    // Merge logic
    // ...
    
+   observerRef.current?.resume(containerElement);
  }
```

### PHASE 3: SIMPLIFY SEGMENTED EDITOR (30 min)

**Changes to `SegmentedEditor.ts`:**

```typescript
// REMOVE handleSegmentedInput (no longer needed during typing)
- export function handleSegmentedInput(...) { ... }

// KEEP ONLY boundary operations
export function handleSegmentedEnter(...) { ... }  // ✅ Keep
export function handleSegmentedBackspace(...) { ... }  // ✅ Keep

// Everything else stays
```

### PHASE 4: DELETE TYPING BUFFER (5 min)

```bash
# Simply delete the file
rm src/editor/TypingBuffer.ts
rm src/editor/TypingBuffer.v2.ts

# Remove from exports
# Edit src/editor/index.ts - remove TypingBuffer exports
```

### PHASE 5: CLEANUP ENFORCEMENT (20 min)

**Changes to `CommitPipeline.ts`:**

```typescript
// REMOVE isTyping checks
- if (isTyping()) {
-   throw new Error('Cannot commit during typing');
- }

// Commits are now always safe - DOM is source of truth
```

**Changes to `invariants.ts`:**

```typescript
// REMOVE typing-related invariants
- export function assertNotTyping() { ... }
```

### PHASE 6: UPDATE TESTS (30 min)

**Delete tests:**
- `__tests__/TypingBuffer.test.ts` - no longer needed

**Update tests:**
- `__tests__/split-merge-exhaustive.test.ts` - should still pass
- Add `__tests__/DOMObserver.test.ts` - new tests

**Run full test suite:**
```bash
npm test
```

---

## VERIFICATION CHECKLIST

### ✅ Unit Tests
```bash
npm test -- DOMObserver
npm test -- split-merge
npm test -- invariants
```

### ✅ Manual Tests

**1. Basic Typing:**
- [ ] Type in empty node
- [ ] Type before inline ref
- [ ] Type after inline ref
- [ ] Type between two refs
- [ ] Delete text
- [ ] Select all + delete

**2. Enter Key:**
- [ ] Enter in middle of text
- [ ] Enter before inline ref
- [ ] Enter after inline ref
- [ ] Enter at start of node
- [ ] Enter at end of node
- [ ] Enter in empty node

**3. Backspace Key:**
- [ ] Backspace in text
- [ ] Backspace at node start (merge)
- [ ] Backspace after inline ref
- [ ] Backspace in empty node

**4. Cursor Stability:**
- [ ] Cursor stays after typing
- [ ] Cursor correct after Enter
- [ ] Cursor correct after Backspace
- [ ] No jumps during typing

**5. Multi-Document:**
- [ ] Switch between documents
- [ ] Type in document A, switch to B, back to A
- [ ] No interference between documents

---

## RISK ASSESSMENT

### 🟢 LOW RISK
- DOMObserver is isolated (new code)
- Split/merge logic unchanged (pure functions)
- Data model unchanged (same segments)
- Tests will catch regressions

### 🟡 MEDIUM RISK
- Cursor positioning after structural ops
  - **Mitigation:** Extensive manual testing
  - **Rollback:** Revert to backup branch
  
- Edge cases with inline elements
  - **Mitigation:** Test every boundary case
  - **Rollback:** Well-defined in Phase 6

### 🔴 HIGH RISK
None - this is a simplification, not added complexity

---

## ROLLBACK PLAN

If anything breaks:

```bash
# Quick rollback
git checkout refactor/mutation-observer-backup

# Or selective rollback
git checkout refactor/mutation-observer-backup -- src/editor/TypingBuffer.ts
git checkout refactor/mutation-observer-backup -- src/NodeEditor.tsx
```

---

## SUCCESS CRITERIA

✅ **Code Metrics:**
- [ ] ~520 fewer lines of code
- [ ] Zero `isTyping()` calls
- [ ] Zero `TypingBuffer` imports
- [ ] All tests pass

✅ **Functional:**
- [ ] Enter key creates nodes correctly
- [ ] Backspace merges correctly
- [ ] Cursor never jumps during typing
- [ ] Inline refs work perfectly

✅ **Performance:**
- [ ] No lag during typing
- [ ] No unnecessary re-renders
- [ ] Observer overhead negligible

---

## TIMELINE

**Total Estimated Time: 3-4 hours**

| Phase | Time | Type |
|-------|------|------|
| 0. Backup | 5 min | Setup |
| 1. DOMObserver | 30 min | New code |
| 2. NodeEditor | 60 min | Refactor |
| 3. SegmentedEditor | 30 min | Simplify |
| 4. Delete TypingBuffer | 5 min | Cleanup |
| 5. Enforcement | 20 min | Cleanup |
| 6. Tests | 30 min | Verification |
| **TOTAL** | **3 hours** | |
| Manual testing | +1 hour | QA |
| **GRAND TOTAL** | **4 hours** | |

---

## NEXT STEPS

Would you like me to:

1. **Start Phase 0-1** (Create DOMObserver) - Low risk, isolated
2. **Create a POC branch** first - Test concept in isolation
3. **Wait for your approval** - Review plan first

The safest approach: **Create POC branch → Test DOMObserver → Full refactor**
