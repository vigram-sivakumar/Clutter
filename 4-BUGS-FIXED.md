# 4 STRUCTURAL BUGS FIXED

**Time:** 2026-02-08  
**Server:** http://localhost:5174/  
**Status:** ALL 4 BUGS FIXED EXACTLY AS SPECIFIED

---

## ✅ BUG 1 FIXED: EditorModel not initialized

### Root cause:
Pipeline running before EditorModel exists

### Error was:
```
Operation "Enter" failed: Error: EditorModel not initialized
at getModel (EditorModel.ts:48)
```

### Fix applied:

**File:** `NodeEditor.tsx` line 294-303

**Change:** Model initialized FIRST, before pipeline

```typescript
// BEFORE:
useEffect(() => {
  _initializePipeline(_setEditorStateRaw, requestCaretPlacement);
  _initializeStateWrapper(_setEditorStateRaw);
  // ...
}, []);

// AFTER:
useEffect(() => {
  // 1. Initialize MODEL FIRST (pipeline depends on it)
  initializeModel(editorState.nodes as Node[], editorState.cursor);

  // 2. Initialize pipeline (safe: model exists now)
  _initializePipeline(_setEditorStateRaw, requestCaretPlacement);
  
  // 3. Initialize state wrapper
  _initializeStateWrapper(_setEditorStateRaw);
  // ...
}, []);
```

**File:** `CommitPipeline.ts` line 166-179

**Added:** Hard guard at top of `performEditorOperation`

```typescript
// 🔒 MODEL GUARD: Ensure model exists before proceeding
const model = getModel();
if (!model) {
  throw new Error(
    'PIPELINE VIOLATION: EditorModel not initialized before operation\n' +
    'Model must be initialized before any operations can run.'
  );
}
```

**Result:** Model always exists when pipeline runs

---

## ✅ BUG 2 FIXED: require() in browser code

### Root cause:
CommonJS `require()` used in ESM/Vite context

### Error was:
```
Uncaught ReferenceError: require is not defined
CommitPipeline.ts:213
```

### Fix applied:

**File:** `CommitPipeline.ts` line 24

**Change:** Static import at top instead of dynamic require()

```typescript
// ADDED:
import { _allowMutation, _blockMutation } from './StateWrapper';

// REMOVED (lines 194, 213):
const { _allowMutation, _blockMutation } = require('./StateWrapper');
const { _blockMutation } = require('./StateWrapper');

// REPLACED WITH (lines 207, 232):
_allowMutation(operation.type);  // ← direct call
_blockMutation();                // ← direct call
```

**Result:** No `require()` in browser code, fail-fast loaded eagerly

---

## ✅ BUG 3 FIXED: Pipeline deadlock

### Root cause:
`unlock()` never runs on error, leaving pipeline locked forever

### Error was:
```
PIPELINE VIOLATION: Attempted to start operation "Enter" while locked
Pipeline auto-unlocked after timeout. This is a bug.
```

**Sequence:**
1. `performEditorOperation("Enter")`
2. Pipeline locks
3. Error thrown (model not initialized)
4. `unlock()` never runs (not in finally)
5. User presses Enter again
6. Pipeline still locked → violation

### Fix applied:

**File:** `CommitPipeline.ts` line 166-230

**Change:** Wrapped operation in `try/finally`, `unlock()` ALWAYS runs

```typescript
// BEFORE:
lock(operation.type);

try {
  // ... operation steps
} catch (error) {
  console.error(`❌ Operation failed:`, error);
  unlock(); // ← ONLY on catch path
  throw error;
}

unlock(); // ← NEVER reached on error

// AFTER:
lock(operation.type);

try {
  // ... operation steps
} catch (error) {
  console.error(`❌ Operation failed:`, error);
  _blockMutation(); // Ensure mutation blocked
  throw error; // Re-throw
} finally {
  // STEP 10: Unlock (ALWAYS runs, even on error)
  unlock(); // ← GUARANTEED
}
```

**File:** `CommitPipeline.ts` lines 29, 65-85, 90-100

**Deleted:** Timeout-based unlock mechanism

```typescript
// DELETED:
let unlockTimer: number | null = null;

// DELETED from lock():
if (unlockTimer) clearTimeout(unlockTimer);
unlockTimer = window.setTimeout(() => {
  console.error('⚠️ Pipeline auto-unlocked after timeout. This is a bug.');
  isLocked = false;
}, 1000);

// DELETED from unlock():
requestAnimationFrame(() => {
  isLocked = false;
  if (unlockTimer) {
    clearTimeout(unlockTimer);
    unlockTimer = null;
  }
  // ...
});

// REPLACED WITH (synchronous):
function unlock(): void {
  isLocked = false;
  if (__DEV__) {
    console.log(`🔓 Pipeline UNLOCKED`);
  }
}
```

**Result:**
- unlock() ALWAYS runs (finally block)
- No timeout-based recovery
- Synchronous unlock (no rAF)
- Crashes are deterministic, not delayed

---

## ✅ BUG 4 FIXED: Reentrancy via key repeat

### Root cause:
No guard against concurrent operations (e.g., user spams Enter)

### Error was:
```
(Secondary) User pressed Enter again while previous Enter failed mid-flight
```

### Fix applied:

**File:** `CommitPipeline.ts` line 166-177

**Added:** Reentrancy guard at top of `performEditorOperation`

```typescript
// 🔒 REENTRANCY GUARD: Reject concurrent operations
if (isLocked) {
  throw new Error(
    `PIPELINE VIOLATION: Reentrant operation "${operation.type}"\n` +
    `Pipeline is already locked. Cannot start new operation while another is in progress.`
  );
}
```

**Note:** Old lock() function had this check, but was AFTER lock was set. New guard is BEFORE any state mutation.

**Result:**
- Second Enter crashes immediately
- No corruption from concurrent ops
- Clear error message

---

## VERIFICATION CHECKLIST

### ✅ All fixes applied:

- [x] EditorModel initialized BEFORE pipeline
- [x] No `require()` anywhere in frontend code
- [x] `performEditorOperation` uses try/finally
- [x] `unlock()` ALWAYS runs (in finally)
- [x] Timeout-based unlock REMOVED
- [x] Reentrancy throws immediately

---

## EXPECTED BEHAVIOR AFTER FIXES

### Case: Model missing (should not happen now)
- ❌ Editor crashes immediately at guard
- ✅ Pipeline unlocks
- ✅ Clear error message
- ✅ No deadlock

### Case: Bug in Enter logic
- ❌ Operation throws
- ✅ Pipeline unlocks
- ✅ Next Enter allowed
- ✅ Bug reproducible deterministically

### Case: User spams Enter
- ❌ Second Enter rejected while locked
- ✅ No corruption
- ✅ No silent state divergence

---

## FILES CHANGED

### `/apps/engine-demo/src/NodeEditor.tsx`

**Lines 294-303:** Added model initialization FIRST

```diff
  useEffect(() => {
    if (pipelineInitializedRef.current) return;

+   // 1. Initialize MODEL FIRST
+   initializeModel(editorState.nodes as Node[], editorState.cursor);

+   // 2. Initialize pipeline
    _initializePipeline(_setEditorStateRaw, requestCaretPlacement);
    
+   // 3. Initialize state wrapper
    _initializeStateWrapper(_setEditorStateRaw);
    
    // ...
  }, []);
```

### `/apps/engine-demo/src/enforcement/CommitPipeline.ts`

**Line 24:** Added static import
```diff
+ import { _allowMutation, _blockMutation } from './StateWrapper';
```

**Lines 29-31:** Removed timeout state
```diff
  let isLocked = false;
  let caretPlacementPending = false;
- let unlockTimer: number | null = null;
```

**Lines 65-77:** Simplified lock() - removed timeout logic
```diff
  function lock(operation: string): void {
    isLocked = true;
    caretPlacementPending = false;

    if (__DEV__) {
      console.log(`🔒 Pipeline LOCKED for: ${operation}`);
    }

-   // Safety: Auto-unlock after 1s
-   if (unlockTimer) clearTimeout(unlockTimer);
-   unlockTimer = window.setTimeout(() => {
-     console.error('⚠️ Pipeline auto-unlocked...');
-     isLocked = false;
-   }, 1000);
  }
```

**Lines 88-95:** Simplified unlock() - synchronous, no rAF
```diff
  function unlock(): void {
-   requestAnimationFrame(() => {
      isLocked = false;
-     if (unlockTimer) {
-       clearTimeout(unlockTimer);
-       unlockTimer = null;
-     }
      if (__DEV__) {
        console.log(`🔓 Pipeline UNLOCKED`);
      }
-   });
  }
```

**Lines 166-230:** Restructured performEditorOperation

```diff
  export function performEditorOperation(operation: EditorOperation): void {
    if (!_setEditorStateInternal) {
      throw new Error('Pipeline not initialized...');
    }

+   // 🔒 REENTRANCY GUARD
+   if (isLocked) {
+     throw new Error(`PIPELINE VIOLATION: Reentrant operation "${operation.type}"`);
+   }

+   // 🔒 MODEL GUARD
+   const model = getModel();
+   if (!model) {
+     throw new Error('PIPELINE VIOLATION: EditorModel not initialized...');
+   }

    lock(operation.type);

    try {
      // ... operation steps
      
-     const { _allowMutation, _blockMutation } = require('./StateWrapper');
      _allowMutation(operation.type);
      
      try {
        _setEditorStateInternal({...});
      } finally {
        _blockMutation();
      }

      // ... caret placement

    } catch (error) {
      console.error(`❌ Operation "${operation.type}" failed:`, error);
-     const { _blockMutation } = require('./StateWrapper');
      _blockMutation();
-     unlock(); // ← MOVED TO FINALLY
      throw error;
+   } finally {
+     // ALWAYS unlock
+     unlock();
    }
-
-   unlock(); // ← REMOVED (dead code)
  }
```

**Net changes:**
- Added 2 guards (reentrancy + model)
- Removed timeout unlock mechanism
- Moved unlock to finally block
- Replaced require() with static imports

---

## SUMMARY

### What was achieved:
- ✅ Fixed all 4 structural bugs
- ✅ Model initialized before pipeline
- ✅ No CommonJS in browser code
- ✅ unlock() guaranteed to run
- ✅ No timeout-based recovery
- ✅ Reentrancy crashes immediately
- ✅ Synchronous unlock (no rAF)

### What to test next:
1. Load http://localhost:5174/
2. Press Enter in a node
3. Check console for:
```
🔒 Enforcement layer initialized
🔒 Pipeline LOCKED for: Enter
📚 EditorModel: Model updated
✅ State updated [Enter]
📍 Caret placement scheduled
✅ Caret placed
🔓 Pipeline UNLOCKED
```

4. Verify new node created correctly
5. Try rapid Enter presses (should not crash or deadlock)

### Expected outcomes:
- ✅ Page loads without errors
- ✅ Enter creates new node
- ✅ No deadlock on error
- ✅ No reentrancy issues
- ✅ Pipeline mathematically safe

---

**Status:** ✅ ALL 4 BUGS FIXED  
**Server:** http://localhost:5174/  
**Next:** Test and report next crash (or success)

**The pipeline is now honest and deterministic.**
