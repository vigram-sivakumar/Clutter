# 🔍 Enter Key Diagnostic Tool

**Created:** January 20, 2026  
**Purpose:** Capture complete execution trace when Enter key is pressed to debug cursor positioning issues

---

## 🎯 What This Does

This diagnostic tool **monkey-patches the editor** to intercept and log **EVERY function call** that happens when you press Enter:

- ⌨️ Keyboard events
- 📝 All ProseMirror transactions
- 🔄 All `appendTransaction` hooks
- 📡 All editor events (`selectionUpdate`, `update`, etc.)
- 👆 Selection state changes
- ⚛️ React component updates

---

## 🚀 How to Use

### **Automatic Activation (Already Done)**

The diagnostic is **automatically enabled** in development mode. It's already active!

### **What to Do:**

1. **Open the browser console** (Chrome DevTools / Firefox DevTools)
2. **Clear the console** (optional, for cleaner output)
3. **Click in the editor** to focus
4. **Press Enter** once

### **What You'll See:**

```
═══════════════════════════════════════════════════
🎯 ENTER KEY PRESSED - STARTING CAPTURE
═══════════════════════════════════════════════════

⌨️ [KEYDOWN] Browser Event
📝 [TRANSACTION] Transaction #1
🔄 [APPENDTRANSACTION] BlockIdGenerator
📝 [TRANSACTION] Transaction #2
📡 [EVENT] editor.emit('selectionUpdate')
👆 [SELECTION] selectionUpdate event

... (complete trace of all execution) ...

═══════════════════════════════════════════════════
📊 EXECUTION TRACE SUMMARY
═══════════════════════════════════════════════════
```

---

## 📊 What to Look For

### **1. Transaction Sequence**

Look at the order and number of transactions:

```
📝 Transaction #1 (origin: Enter handler)
  - steps: 2
  - docChanged: true
  - selectionSet: true ✅
  - selection.from: 123 (new cursor position)

📝 Transaction #2 (origin: BlockIdGenerator)
  - steps: 0
  - docChanged: true
  - selectionSet: true ✅
  - selection.from: 123 (preserved)
```

### **2. Invariant Violations**

Look for these errors:

```
❌ INVARIANT VIOLATION: docChanged without selectionSet!
❌ BlockIdGenerator returned docChanged without selectionSet!
```

### **3. appendTransaction Hooks**

See which plugins are modifying the transaction:

```
🔄 appendTransaction hooks:
  - BlockIdGenerator ✅
  - UndoBoundaries (if enabled)
  - history plugin
```

### **4. Final Selection State**

Check where the cursor ends up:

```
👆 Final selection state:
  Type: TextSelection
  Position: 123
  Node: paragraph
```

**Question:** Is this the **new block** or the **old block**?

---

## 🔎 Key Things to Check

### **A. Is Selection Being Set?**

Look for `selectionSet: false` in any transaction that has `docChanged: true`:

```typescript
// ❌ BAD - this will break cursor
{
  docChanged: true,
  selectionSet: false,  // ← PROBLEM!
}

// ✅ GOOD
{
  docChanged: true,
  selectionSet: true,  // ← Correct
}
```

### **B. Is Selection Being Preserved?**

Compare selection positions across transactions:

```typescript
Transaction #1: selection.from = 123  (new block)
Transaction #2: selection.from = 123  (preserved ✅)
Transaction #3: selection.from = 45   (CHANGED! Why? ❌)
```

### **C. What Events Fire?**

Look for suspicious event patterns:

```typescript
// Normal flow:
selectionUpdate → update → (done) ✅

// Problematic flow:
selectionUpdate → update → selectionUpdate → update → ... (loop? ❌)
```

### **D. Timing**

Look at timestamps - are there delays or multiple rounds?

```typescript
timestamp: 0.0ms    - Enter pressed
timestamp: 1.2ms    - Transaction #1
timestamp: 1.5ms    - appendTransaction
timestamp: 100.5ms  - React re-render (too late! ❌)
```

---

## 🧪 Expected vs Actual

### **Expected Flow (Working):**

```
1. ⌨️ Enter key pressed
2. 📝 Enter handler creates transaction
   - Inserts new block
   - Sets selection to new block (pos 123)
3. 🔄 BlockIdGenerator appendTransaction
   - Adds blockId
   - Preserves selection (pos 123)
4. 👆 selectionUpdate event fires
   - Cursor at pos 123 (new block) ✅
```

### **Actual Flow (If Broken):**

Look for deviations:

```
1. ⌨️ Enter key pressed
2. 📝 Enter handler creates transaction
   - Inserts new block
   - Sets selection to new block (pos 123)
3. 🔄 BlockIdGenerator appendTransaction
   - Adds blockId
   - ❌ MISSING: tr.setSelection()  ← PROBLEM!
4. 👆 selectionUpdate event fires
   - Cursor at pos 45 (old block) ❌
```

---

## 📋 Checklist

After pressing Enter, check the console for:

- [ ] How many transactions fired?
- [ ] Did all transactions set selection?
- [ ] Are there any "INVARIANT VIOLATION" errors?
- [ ] What's the final cursor position?
- [ ] Which appendTransaction hooks fired?
- [ ] Were there any unexpected events?
- [ ] Any timing anomalies (delays > 50ms)?

---

## 💡 Pro Tips

### **Access Full Event Log:**

In the browser console, type:

```javascript
__enterKeyEventLog;
```

This gives you the raw array of all captured events for deeper analysis.

### **Compare Positions:**

To see if cursor moved to new block:

1. Note the cursor position **before** pressing Enter
2. Press Enter
3. Check final selection position in the trace
4. Calculate: Did it increase by roughly the block size?

### **Find the Culprit:**

If cursor doesn't move:

1. Look for the **last transaction** with `selectionSet: true`
2. Note its selection position
3. See if any **later transaction** changed it without setting selection
4. That's your culprit! 🎯

---

## 🔧 Disabling the Diagnostic

If you want to disable it:

```typescript
// In browser console:
import { disableEnterKeyDiagnostics } from '@clutter/editor/diagnostics/EnterKeyDebugger';
disableEnterKeyDiagnostics();
```

Or comment out the useEffect in `EditorCore.tsx`.

---

## 📝 What to Report

When sharing results, include:

1. **Complete console output** (copy/paste the entire trace)
2. **Transaction sequence** from the summary
3. **Any errors** (especially "INVARIANT VIOLATION")
4. **Final cursor position** and expected position
5. **What you were doing** (typing what text, cursor where, etc.)

---

## 🎯 Next Steps

1. **Run the diagnostic** - Press Enter and capture the trace
2. **Analyze the output** - Use the checklist above
3. **Share the results** - Paste the console output
4. **We'll identify the issue** - Based on the trace data

---

**File Location:** `packages/editor/diagnostics/EnterKeyDebugger.ts`  
**Integration:** `packages/editor/core/EditorCore.tsx` (line ~412)  
**Status:** ✅ Active in development mode
