# Cursor AI Enforcement Checklist

**(Selection, Caret, Markdown Safety Net)**

**Status**: 🔒 ENFORCEMENT  
**Applies To**: All future editor changes  
**Effective Date**: 2026-02-06

This checklist exists to prevent regressions across Files 03 → 07.2.

**If any item fails, the change must not ship.**

---

## SECTION A — Absolute Prohibitions (Fail = Reject PR)

If Cursor AI introduces any of the following, the change is **invalid**.

### A1. contentEditable Violations ❌

- ❌ React children inside `contentEditable`
- ❌ `{node.text}` rendered directly
- ❌ `dangerouslySetInnerHTML`
- ❌ Replacing DOM text during typing

**✅ Only allowed pattern:**

- DOM-owned text
- `ref.textContent` sync only on external changes

---

### A2. Selection Ownership Violations ❌

- ❌ `sel.removeAllRanges()` during normal operation
- ❌ `sel.addRange()` except after allowed operations
- ❌ Selection logic in `onClick`, `onMouseDown`, `onMouseUp`
- ❌ Per-node selection listeners

**✅ Only allowed:**

- Passive `document.selectionchange`
- Read-only DOM → state translation

---

### A3. Caret Fighting ❌

- ❌ Manual caret movement during typing
- ❌ Caret placement inside `selectionchange`
- ❌ Caret placement on mouse events
- ❌ Caret placement driven by React state updates

**Caret placement is allowed only per File 06.1.**

---

### A4. Markdown Cleanup Hacks ❌

- ❌ Insert-then-delete space
- ❌ Regex cleanup
- ❌ Post-input cleanup
- ❌ `useEffect` markdown fixes
- ❌ Async markdown resolution
- ❌ Reading markdown state from React

**Markdown must be pre-mutation interception only.**

---

## SECTION B — Mandatory Architecture Checks

These must exist and must follow the exact constraints.

---

### B1. Typing Model (CRITICAL)

| Action                 | Owner   |
| ---------------------- | ------- |
| Character typing       | Browser |
| Space (normal)         | Browser |
| ArrowLeft / ArrowRight | Browser |
| Mouse selection        | Browser |
| IME                    | Browser |

**Editor must not:**

- `preventDefault()` on characters
- Insert text manually
- Commit state per keystroke

---

### B2. Input Observation (Required)

- ✅ `input` event listener exists
- ✅ Reads DOM text via `textContent`
- ✅ Updates state without caret placement
- ✅ No `commit()` during typing

---

### B3. Caret Placement Gate (File 06.1)

Caret placement must satisfy **ALL**:

- Uses `useRef`, not React state
- One-shot flag (`needsCaretPlacementRef`)
- Executed in effect AFTER render
- Immediately resets flag

**Allowed triggers ONLY:**

- Enter
- Backspace merge/delete
- Tab / Shift+Tab
- ArrowUp / ArrowDown
- Markdown conversion
- Undo / Redo
- Collapse / Expand boundaries

---

## SECTION C — Markdown Enforcement (Files 07 / 07.1 / 07.2)

### C1. Trigger Timing (MANDATORY)

Markdown must:

- Trigger only on `keydown`
- Trigger only on space
- Run before DOM mutation
- Call `preventDefault()` ONLY when matched

---

### C2. Detection Source (MANDATORY)

Markdown detection must use:

- DOM selection (Range API)
- DOM text (`textContent`)

Markdown detection must NOT use:

- ❌ `editorState.offset`
- ❌ React state timing
- ❌ `selectionchange` having fired

---

### C3. Atomicity Rules (MANDATORY)

On match:

- Prefix is never inserted
- Space is never inserted
- Variant changes once
- Text updates once
- Caret placed once
- One undo entry created

**If any of these require multiple steps → FAIL**

---

## SECTION D — Keyboard Rules Validation (Files 03 / 03.1)

Before merging, verify manually:

### D1. Arrow Keys (File 03.1)

- ✅ ArrowLeft / Right: browser-native (NO interception)
- ✅ ArrowUp / Down: editor-controlled (allowed interception)
- ❌ No horizontal arrow simulation
- ❌ No preventDefault on ArrowLeft/Right except boundaries

### D2. Enter (File 03)

- START → sibling above
- MIDDLE → split
- END / empty → sibling below
- Variant preserved
- Caret correct

### D3. Backspace (File 03)

- Selection → delete
- START + empty → delete node
- START + text → merge
- ❌ Never outdent

### D4. Keyboard Ownership (File 03.1)

- ✅ Browser owns character typing
- ✅ Browser owns horizontal navigation
- ✅ Browser owns space (except markdown)
- ✅ Editor owns structural keys only
- ❌ No preventDefault on browser-owned keys

---

## SECTION E — Regression Smoke Tests (MANDATORY)

Cursor AI must confirm all pass:

### Typing

- Click mid-text → type → caret advances normally
- No cursor jump
- No delayed rendering
- **Typing does NOT create undo entries**

### Markdown

- `[]␣` → task, empty, caret at 0
- `-␣` → bullet
- `#␣` → heading
- Undo restores exact pre-space state

### Selection

- Drag selection across nodes
- Shift+arrow works
- No data mutation

### Undo/Redo (File 08)

- Ctrl+Z undoes one semantic operation only
- Typing characters does NOT appear in history
- Enter creates undo entry
- Backspace merge creates undo entry
- Markdown conversion creates ONE undo entry
- Undo restores exact previous state (no partial)
- Redo reapplies operation exactly

---

## SECTION F — Forbidden Excuses (AUTO-REJECT)

Cursor AI responses that must be rejected:

- "React state is eventually consistent"
- "We can fix it in useEffect"
- "We'll clean it after input"
- "This is simpler"
- "Users won't notice"
- "It mostly works"

**These indicate architectural drift.**

---

## FINAL ENFORCEMENT RULE

> If Cursor AI proposes a fix that adds code instead of removing ownership violations, it is the wrong fix.

**Browser owns typing.**  
**Editor observes.**  
**Intervene only when structure changes.**

---

## Status

- ✅ Written
- ✅ Aligned with Files 03–07.2
- ✅ **ENFORCEMENT ACTIVE**

**This checklist is now your gatekeeper.**

---

**END OF ENFORCEMENT CHECKLIST**
