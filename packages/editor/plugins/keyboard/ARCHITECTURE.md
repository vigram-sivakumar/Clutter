# Keyboard Handler Architecture Contract

**Last Updated:** 2026-01-20  
**Status:** ✅ Active & Enforced

---

## 🎯 **PURPOSE**

This document defines the **immutable contract** for keyboard handler architecture in the Clutter editor. These rules are **enforced by tooling** (ESLint + runtime validation) and **cannot be violated** without explicit override.

---

## 🔒 **GOLDEN RULES** (NEVER VIOLATE)

### **Rule 1: UI Intent Always Wins**

```typescript
// ✅ CORRECT: UI handlers take precedence automatically
export const handleEnter = withUISafety(handleEnterImpl, 'handleEnter');

// ❌ WRONG: Manual check (fragile, easy to forget)
export function handleEnter(editor: Editor): boolean {
  if (editor.storage.slashCommands?.isOpen) return false;
  // ...
}
```

**Why:** Structural handlers (Enter, Tab, Backspace) must never consume keys when UI components (menus, dropdowns, pickers) are active. The `withUISafety` wrapper enforces this automatically.

---

### **Rule 2: Mandatory Wrapper**

**ALL keyboard handlers in `/keyboard/keymaps/` MUST use `withUISafety`.**

```typescript
// ✅ CORRECT
import { withUISafety } from '../withUISafety';

function handleMyKeyImpl(editor: Editor): boolean {
  // Handler logic here
  return true;
}

export const handleMyKey = withUISafety(handleMyKeyImpl, 'handleMyKey');
```

**Enforcement:**

- ✅ ESLint fails build if handler isn't wrapped
- ✅ Runtime validation logs violations in dev mode
- ✅ PR checks block merge

**Escape Hatch** (use sparingly):

```typescript
// eslint-disable-next-line keyboard/require-ui-safety-wrapper
export function handleSpecialCase(editor: Editor): boolean { ... }
```

---

### **Rule 3: Single Source of Truth**

**UI intent is declared in EXACTLY ONE place: `uiIntent.ts`**

```typescript
// ✅ CORRECT: Register in uiIntent.ts
const UI_HANDLERS: readonly UIHandlerConfig[] = [
  {
    name: 'slashCommands',
    isActive: (editor) => editor.storage.slashCommands?.isOpen ?? false,
    priority: 10000,
  },
  // ...
];

// ❌ WRONG: Direct storage check in handler
if (editor.storage.slashCommands?.isOpen) return false;
```

**Why:** Centralization prevents:

- Inconsistent checks across handlers
- Missing UI components in some handlers
- Duplicate logic maintenance

---

### **Rule 4: Handler Return Contract**

```typescript
// ✅ CORRECT
function handleEnterImpl(editor: Editor): boolean {
  // Mutate document
  tr.insert(pos, newNode);
  view.dispatch(tr);
  return true; // ✅ Key consumed, transaction dispatched
}

// ✅ CORRECT
function handleEnterImpl(editor: Editor): boolean {
  // No mutation needed
  return false; // ✅ Pass to next handler
}

// ❌ WRONG
function handleEnterImpl(editor: Editor): boolean {
  // No transaction dispatched
  return true; // ❌ Consumed key without action
}
```

**Contract:**

- `true` = Key consumed, transaction dispatched, prevent default behavior
- `false` = Key not handled, pass to next handler or default behavior

**Dev-Mode Validation:** Violations are logged to console and stored in `window.__keyboardDebug.violations`

---

### **Rule 5: Priority is Informational Only**

**Priority levels are documentation, NOT enforcement mechanism.**

| Range     | Purpose             | Examples                             |
| --------- | ------------------- | ------------------------------------ |
| 10000+    | UI Components       | SlashCommands, AtMention, DatePicker |
| 1000-9999 | Structural Handlers | Enter, Tab, Backspace, Arrows        |
| 0-999     | Default ProseMirror | Native text editing                  |

**Why:** The `withUISafety` wrapper handles precedence automatically. You don't adjust priorities to fix conflicts—you register UI intent in `uiIntent.ts`.

---

## 📝 **HOW TO: Add a New UI Component**

### **Step 1: Register in `uiIntent.ts`**

```typescript
export type UIIntentType = 'slashCommands' | 'atMention' | 'myNewPicker'; // ← Add here

const UI_HANDLERS: readonly UIHandlerConfig[] = [
  // ... existing handlers
  {
    name: 'myNewPicker',
    isActive: (editor) => editor.storage.myNewPicker?.open ?? false,
    priority: 10000,
  },
];
```

### **Step 2: Done!**

That's it. All existing structural handlers automatically defer to your new UI component.

**No changes needed in:**

- ✅ Enter handler
- ✅ Tab handler
- ✅ Backspace handler
- ✅ Arrow handlers

---

## 📝 **HOW TO: Add a New Keyboard Handler**

### **Step 1: Write Implementation**

```typescript
// packages/editor/plugins/keyboard/keymaps/myKey.ts
import { Editor } from '@tiptap/core';
import { withUISafety } from '../withUISafety';

function handleMyKeyImpl(editor: Editor): boolean {
  // Your handler logic
  const { state, view } = editor;

  // ... do work ...

  view.dispatch(tr);
  return true; // Key consumed
}

export const handleMyKey = withUISafety(handleMyKeyImpl, 'handleMyKey');
```

### **Step 2: Register in KeyboardShortcuts**

```typescript
// packages/editor/plugins/KeyboardShortcuts.ts
import { handleMyKey } from './keyboard/keymaps/myKey';

addKeyboardShortcuts() {
  return {
    // ...
    'Ctrl-k': ({ editor }) => handleMyKey(editor),
  };
}
```

### **Step 3: ESLint Validates**

If you forget the wrapper, the build fails:

```
✖ Keyboard handler "handleMyKey" must be wrapped with withUISafety()
  See packages/editor/plugins/keyboard/ARCHITECTURE.md
```

---

## 🧪 **DEBUGGING & VALIDATION**

### **Dev-Mode Debug Console**

```typescript
// Access in browser console
window.__keyboardDebug;
// {
//   events: [...],    // All keyboard events
//   violations: [...] // Contract violations
// }
```

### **Check Active UI Handler**

```typescript
import { getActiveUIHandler } from './keyboard/uiIntent';

const activeUI = getActiveUIHandler(editor);
console.log(`Active UI: ${activeUI}`); // "slashCommands" | null
```

### **List All Registered UI Handlers**

```typescript
import { getRegisteredUIHandlers } from './keyboard/uiIntent';

console.log(getRegisteredUIHandlers());
// ["slashCommands", "atMention", ...]
```

---

## ⚠️ **WHAT NOT TO DO**

### ❌ **Don't manually check UI state**

```typescript
// ❌ WRONG
if (editor.storage.slashCommands?.isOpen) return false;
```

### ❌ **Don't adjust priorities to fix conflicts**

```typescript
// ❌ WRONG
priority: 15000; // "so it runs before slash commands"
```

### ❌ **Don't export unwrapped handlers**

```typescript
// ❌ WRONG
export function handleEnter(editor: Editor): boolean { ... }
```

### ❌ **Don't return `true` without dispatching**

```typescript
// ❌ WRONG
function handleEnterImpl(editor: Editor): boolean {
  console.log('Pressed Enter');
  return true; // ❌ No transaction!
}
```

---

## 📚 **RELATED FILES**

| File                                               | Purpose                                        |
| -------------------------------------------------- | ---------------------------------------------- |
| `uiIntent.ts`                                      | UI component registry (single source of truth) |
| `withUISafety.ts`                                  | Automatic guard wrapper                        |
| `ARCHITECTURE.md`                                  | This document (the contract)                   |
| `.eslint-local/rules/require-ui-safety-wrapper.js` | ESLint enforcement                             |
| `COLLAPSED_CONTAINERS.md`                          | Collapsed toggle/task keyboard behavior        |
| `utils.ts`                                         | ⚠️ Deprecated `shouldDeferToUI` (migrate away) |

---

## 🎓 **PHILOSOPHY**

This architecture transitions from:

**❌ Convention-Based** (easy to violate)  
→ **✅ Enforcement-Based** (impossible to violate)

**Before:**

> "Remember to check if UI is active before handling keys"

**After:**

> "The system mechanically prevents UI/structural conflicts"

---

## 📄 **VERSION HISTORY**

| Version | Date       | Changes                                  |
| ------- | ---------- | ---------------------------------------- |
| 1.0     | 2026-01-20 | Initial architecture contract            |
| 1.1     | 2026-01-29 | Added collapsed containers documentation |

---

**Questions? Violations? Improvements?**  
Contact: Architecture Team

**This document is law. Violations are bugs.**
