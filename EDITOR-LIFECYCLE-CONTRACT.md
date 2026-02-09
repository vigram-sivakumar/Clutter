# EDITOR LIFECYCLE CONTRACT

**Version:** 2.0 (Post-MutationObserver Refactor)  
**Date:** February 4, 2026  
**Status:** MANDATORY - Zero Tolerance

---

## PRINCIPLE 1: SEPARATION OF CONCERNS

### React Owns Observer Lifecycle

**Exclusive Responsibility:**

- Create observers when nodes mount
- Destroy observers when nodes unmount
- Recreate observers after state changes

**Implementation:**

```typescript
useEffect(() => {
  const newObservers = new Map();

  editorState.nodes.forEach((node) => {
    const element = document.querySelector(`[data-node-id="${node.id}"]`);
    if (element) {
      const observer = new DOMObserver({
        element: element as HTMLElement,
        onMutationsBatched: (mutations) => {
          /* diagnostics */
        },
      });
      observer.start();
      newObservers.set(node.id, observer);
    }
  });

  domObservers.current = newObservers;

  return () => {
    newObservers.forEach((obs) => obs.destroy());
  };
}, [editorState.nodes]);
```

### Handlers Own State Updates

**Exclusive Responsibility:**

- Stop observers temporarily (before DOM read)
- Extract DOM → segments
- Read DOM → cursor
- Update state/model
- Place caret (after render)

**Implementation Pattern:**

```typescript
const handleCommitBoundary = (e: Event) => {
  // 1. Guard
  if (isComposing) return;

  // 2. Stop observer
  const observer = domObservers.current.get(nodeId);
  if (observer) observer.stop();

  // 3. Extract DOM
  const segments = extractSegmentsFromDOM(element);

  // 4. Read cursor
  const cursor = getNodePositionFromSelection({ id: nodeId, segments });

  // 5. Update state (functional)
  setEditorState(prev => ({
    ...prev,
    nodes: /* updated */,
    cursor: cursor,
  }));

  // 6. Clear diagnostics
  if (observer) observer.clearPendingMutations();

  // 7. Place caret after render
  requestAnimationFrame(() => {
    requestCaretPlacement();
  });

  // EXIT - React handles observer lifecycle
};
```

---

## PRINCIPLE 2: HANDLER BOUNDARIES

### ✅ Handlers MAY

1. **Stop observer** (temporary, before DOM read)

   ```typescript
   observer?.stop();
   ```

2. **Destroy observer** (ONLY for deleted nodes)

   ```typescript
   if (currentObserver) {
     currentObserver.clearPendingMutations();
     currentObserver.destroy();
     domObservers.current.delete(nodeId);
   }
   ```

3. **Extract DOM**

   ```typescript
   const segments = extractSegmentsFromDOM(element);
   ```

4. **Read selection**

   ```typescript
   const cursor = getNodePositionFromSelection({ id, segments });
   ```

5. **Update state/model**

   ```typescript
   setEditorState((prev) => ({ ...prev, nodes: updated }));
   ```

6. **Place caret** (after render)
   ```typescript
   requestAnimationFrame(() => requestCaretPlacement());
   ```

### ❌ Handlers MUST NEVER

1. **Start/restart observers**

   ```typescript
   observer.start(); // ❌ FORBIDDEN
   ```

2. **Create new observers**

   ```typescript
   new DOMObserver({
     /* ... */
   }); // ❌ FORBIDDEN
   ```

3. **Manage observer lifecycle after commit**

   ```typescript
   requestAnimationFrame(() => {
     observer.start(); // ❌ FORBIDDEN - stale reference
   });
   ```

4. **Touch observers in error paths**

   ```typescript
   if (!element) {
     observer.start(); // ❌ FORBIDDEN
     return;
   }
   ```

5. **Touch observers in early returns**
   ```typescript
   if (atBoundary) {
     observer.start(); // ❌ FORBIDDEN
     return;
   }
   ```

---

## PRINCIPLE 3: OBSERVER REFERENCE LIFETIME

### Rule: After State Commit, Observer References Are Dead

**Why:**

- React unmounts old nodes
- React destroys old observers
- React creates new observers
- Handler's closure captures stale references

**Consequence:**

```typescript
const observer = domObservers.current.get(nodeId); // Valid here
setEditorState({
  /* ... */
}); // State committed

// After this point:
requestAnimationFrame(() => {
  observer.start(); // ❌ CRASH - "Cannot read properties of null"
  // React already destroyed this observer and created new ones
});
```

**Correct:**

```typescript
const observer = domObservers.current.get(nodeId);
setEditorState({
  /* ... */
});

// After this point:
requestAnimationFrame(() => {
  requestCaretPlacement(); // ✅ SAFE - no observer references
  // React's useEffect handles new observers
});
```

---

## PRINCIPLE 4: BLUR IS SPECIAL

### Blur Is a Flush, Not Structural

**Characteristics:**

- Commits pending DOM changes
- Does NOT modify document structure
- May fire after node unmounted
- Observer may already be destroyed

**Correct Implementation:**

```typescript
const handleBlur = (e: FocusEvent) => {
  // Guard composition
  if (isComposing) return;

  const nodeId = target.getAttribute('data-node-id');
  const observer = domObservers.current.get(nodeId);

  // Graceful: observer may not exist (node unmounted)
  if (!observer) return; // ✅ Silent no-op, not error

  observer.stop();
  const segments = extractSegmentsFromDOM(target);

  // Update state directly (no structural lock)
  setEditorState((prev) => ({
    ...prev,
    nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, segments } : n)),
  }));

  observer.clearPendingMutations();

  // EXIT - no caret placement (focus left), no observer restart
};
```

**Anti-patterns:**

```typescript
// ❌ Don't treat missing observer as error
if (!observer) {
  console.error('[Blur] No observer'); // ❌ WRONG
  return;
}

// ❌ Don't use structural lock
withStructuralCommit(() => {
  /* ... */
}); // ❌ WRONG for blur

// ❌ Don't restart observer
observer.start(); // ❌ WRONG - focus left
```

---

## PRINCIPLE 5: STRUCTURAL COMMIT USAGE

### Rule: withStructuralCommit ONLY for Node Identity/Count Changes

**Use withStructuralCommit when:**

- ✅ Enter (creates new node - count increases)
- ✅ Backspace merge (deletes node - count decreases)
- ✅ Any operation that changes node array length

**Do NOT use withStructuralCommit for:**

- ❌ Blur (flush only - no structural change)
- ❌ Arrow navigation (cursor move - no node changes)
- ❌ Typing (DOM-owned - no state change)

**Rationale:**

- Structural lock prevents concurrent operations during DOM restructuring
- Blur/Arrow are safe concurrent operations (no node identity changes)
- Unnecessary locking reduces performance and adds complexity

---

## PRINCIPLE 6: COMMIT BOUNDARY CHECKLIST

Every handler touching observers MUST follow this sequence:

### Mandatory Steps (In Order)

1. ✅ **Guard composition**

   ```typescript
   if (isComposing) return;
   ```

2. ✅ **Stop observer(s)**

   ```typescript
   observer?.stop();
   ```

3. ✅ **Extract DOM**

   ```typescript
   const segments = extractSegmentsFromDOM(element);
   ```

4. ✅ **Read cursor**

   ```typescript
   const cursor = getNodePositionFromSelection({ id, segments });
   ```

5. ✅ **Update state (functional)**

   ```typescript
   setEditorState((prev) => ({ ...prev /* ... */ }));
   ```

6. ✅ **Clear diagnostics**

   ```typescript
   observer?.clearPendingMutations();
   ```

7. ✅ **Destroy ONLY for deleted nodes**

   ```typescript
   if (nodeDeleted) {
     observer?.destroy();
     domObservers.current.delete(nodeId);
   }
   ```

8. ✅ **Place caret (after render)**

   ```typescript
   requestAnimationFrame(() => requestCaretPlacement());
   ```

9. ✅ **EXIT** - no observer lifecycle work

### Verification Questions

- [ ] Does handler call `observer.start()`? → ❌ VIOLATION
- [ ] Does handler create `new DOMObserver()`? → ❌ VIOLATION
- [ ] Does handler touch observers after state commit? → ❌ VIOLATION
- [ ] Does error path restart observer? → ❌ VIOLATION
- [ ] Does early return restart observer? → ❌ VIOLATION
- [ ] Does blur use structural lock? → ❌ VIOLATION
- [ ] Does blur treat missing observer as error? → ❌ VIOLATION

---

## ENFORCEMENT

### Dev-Time Assertions

Add to all handlers:

```typescript
if (__DEV__) {
  // After state commit
  setTimeout(() => {
    const currentObserver = domObservers.current.get(nodeId);
    if (currentObserver && currentObserver !== originalObserver) {
      console.warn(
        '[Contract Violation] Observer reference changed after commit'
      );
    }
  }, 100);
}
```

### Code Review Checklist

- [ ] Grep for `observer.start()` in handlers → All removed
- [ ] Grep for `new DOMObserver()` in handlers → All removed
- [ ] All `setEditorState` are functional (`prev => ...`)
- [ ] Blur handler has no structural lock
- [ ] Blur handler has graceful missing observer handling
- [ ] No observer references touched after `setEditorState`

### Testing

- [ ] Enter key creates split → no crashes
- [ ] Backspace merges nodes → no crashes
- [ ] Arrow keys navigate → no crashes
- [ ] Rapid Enter+Backspace → no crashes
- [ ] Blur while typing → no crashes
- [ ] Delete node while focused → no crashes

---

## RATIONALE

**Why This Contract?**

1. **Single Source of Truth:** React owns lifecycle = no conflicts
2. **Stale References:** Handlers can't safely touch observers after commit
3. **Race Conditions:** Double RAF doesn't fix lifecycle ownership
4. **Simplicity:** Handlers do state updates, React does infrastructure
5. **Debuggability:** Clear boundaries = easy to trace bugs

**What Tana Does:**

- MutationObserver tracks DOM passively
- Handlers extract at boundaries
- Framework (React/equivalent) owns observer lifecycle
- No manual observer management in event handlers

**Our Implementation:**

- Same pattern
- React `useEffect` is observer factory
- Handlers are pure state updaters
- Zero observer lifecycle in handlers

---

## SIGNATURES

This contract is **NON-NEGOTIABLE**.  
Violations will cause crashes and data corruption.  
All code touching observers must comply.

**Approved By:** Phase 2 Audit & Correction (February 4, 2026)  
**Enforced By:** Code review + dev assertions  
**Valid Until:** Architecture changes

---

**END OF CONTRACT**
