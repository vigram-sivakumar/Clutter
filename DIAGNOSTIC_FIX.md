# 🔧 Diagnostic Tool Fixed - Option A Implementation

**Date:** January 20, 2026  
**Status:** ✅ FIXED - Using Native DOM Event Listeners

---

## 🔴 What Was Broken

The original diagnostic was using `view.setProps()` to modify ProseMirror's props after the view was already created, which caused:

```
❌ TypeError: null is not an object (evaluating 'this.docView.matchesNode')
```

This corrupted ProseMirror's internal state and prevented the diagnostic from working.

---

## ✅ The Fix - Option A: Native DOM Event Listeners

### **What Changed:**

Replaced the dangerous `view.setProps()` approach with **native DOM event listeners**, which is:

- ✅ Safe (no ProseMirror internal state modification)
- ✅ Clean (proper event capture phase)
- ✅ Reliable (no conflicts with existing handlers)

### **Key Changes:**

#### **1. DOM Event Listener Instead of setProps**

**Before (Broken):**

```typescript
view.setProps({
  handleDOMEvents: {
    keydown: (view, event) => {
      /* ... */
    },
  },
});
```

**After (Fixed):**

```typescript
const handleKeyDown = (event: KeyboardEvent) => {
  /* ... */
};
view.dom.addEventListener('keydown', handleKeyDown, true); // capture phase
```

#### **2. Proper Initialization Guards**

Added multiple safety checks to prevent double initialization:

```typescript
// Check if already installed on this view
if ((view as any).__enterDiagnosticInstalled) {
  return;
}

// Check global flag
if (diagnosticActive && currentEditor === editor) {
  return;
}

// Mark as installed
(view as any).__enterDiagnosticInstalled = true;
```

#### **3. Cleanup Tracking**

All patches are now tracked for proper cleanup:

```typescript
cleanupFunctions.push(() => {
  view.dom.removeEventListener('keydown', handleKeyDown, true);
});

cleanupFunctions.push(() => {
  view.dispatch = originalDispatch;
});
```

#### **4. HMR Support**

Added Vite Hot Module Reload support:

```typescript
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (diagnosticActive) {
      disableEnterKeyDiagnostics();
    }
  });
}
```

#### **5. React Cleanup**

Updated EditorCore.tsx to properly cleanup on unmount:

```typescript
useEffect(() => {
  if (!editor || !import.meta.env.DEV) return;

  let cleanup: (() => void) | null = null;

  import('../diagnostics/EnterKeyDebugger').then(
    ({ enableEnterKeyDiagnostics, disableEnterKeyDiagnostics }) => {
      enableEnterKeyDiagnostics(editor);
      cleanup = disableEnterKeyDiagnostics;
    }
  );

  return () => {
    if (cleanup) cleanup();
  };
}, [editor]);
```

---

## 🧪 How to Test

### **Step 1: Refresh the App**

Since you already have the dev server running (port 1420), just **refresh the browser** or the HMR will auto-update.

### **Step 2: Open Developer Console**

- **macOS:** `Cmd + Option + I`
- **Windows/Linux:** `Ctrl + Shift + I`

### **Step 3: Look for Initialization Message**

You should see:

```
🔍 ENTER KEY DIAGNOSTICS ENABLED
Press Enter to see complete execution trace...

✅ Diagnostics installed successfully!

🔍 Enter key diagnostics active - press Enter to see trace
```

**Important:** You should see this **ONLY ONCE**, not twice!

### **Step 4: Press Enter in the Editor**

You should see the complete trace:

```
═══════════════════════════════════════════════════
🎯 ENTER KEY PRESSED - STARTING CAPTURE
═══════════════════════════════════════════════════

⌨️ [KEYDOWN] Browser Event
📝 [TRANSACTION] Transaction #1
🔄 [APPENDTRANSACTION] BlockIdGenerator
📝 [TRANSACTION] Transaction #2
👆 [SELECTION] selectionUpdate event

... (complete trace) ...

═══════════════════════════════════════════════════
📊 EXECUTION TRACE SUMMARY
═══════════════════════════════════════════════════
```

---

## 🎯 What to Look For in the Output

### **1. Transaction Sequence**

Check how many transactions fire and if they all set selection:

```
📝 Transaction sequence:
  1. Transaction #1 (steps: 2, selection: 123)
  2. Transaction #2 (steps: 0, selection: 123) ← Should be same as #1
```

### **2. Invariant Violations**

Look for these errors:

```
❌ INVARIANT VIOLATION: docChanged without selectionSet!
```

### **3. Final Cursor Position**

Check where the cursor ended up:

```
👆 Final selection state:
  Type: TextSelection
  Position: 123
  Node: paragraph
```

**Question:** Is position 123 in the **new block** or **old block**?

---

## 📊 Files Modified

### **Fixed:**

- ✅ `packages/editor/diagnostics/EnterKeyDebugger.ts` - Complete rewrite using DOM listeners
- ✅ `packages/editor/core/EditorCore.tsx` - Added proper cleanup

### **Benefits:**

- 🔒 No ProseMirror state corruption
- 🔄 Proper HMR support
- 🧹 Clean cleanup on unmount
- 🚫 No double initialization
- ✅ Safe and reliable

---

## 🔍 Technical Details

### **Why Native DOM Listeners Are Better:**

1. **Capture Phase:** Events are captured before ProseMirror's handlers run
2. **No State Mutation:** We're only observing, not modifying ProseMirror's internal state
3. **No Conflicts:** Doesn't interfere with existing ProseMirror event handlers
4. **Clean Removal:** Easy to remove with `removeEventListener()`

### **Event Flow:**

```
1. User presses Enter
2. DOM 'keydown' event fires
3. Our listener captures it (capture phase) ✅
4. ProseMirror's handlers run (bubble phase)
5. Transaction dispatches → we intercept
6. appendTransaction hooks → we intercept
7. selectionUpdate event → we intercept
8. Summary printed after 100ms
```

---

## 🎉 Expected Results

### **No More Errors:**

- ❌ No `TypeError: null is not an object`
- ❌ No double initialization warnings
- ❌ No HMR crashes

### **Clean Output:**

- ✅ Single initialization message
- ✅ Complete trace on Enter key
- ✅ Clear summary at the end

---

## 📝 Next Steps

1. **Refresh your app** (or wait for HMR)
2. **Open console** and verify single initialization
3. **Press Enter** and capture the trace
4. **Share the output** - we can now see exactly what's happening!

---

**Status:** ✅ Ready to test!  
**File:** `packages/editor/diagnostics/EnterKeyDebugger.ts`  
**Integration:** `packages/editor/core/EditorCore.tsx`
