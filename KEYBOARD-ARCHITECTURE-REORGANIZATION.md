# Keyboard Architecture Reorganization — COMPLETE

## ✅ Structural Reorganization Complete

All files have been moved to establish clear architectural boundaries.
**Zero logic changes** — only import path updates.

---

## 📁 New Structure

```
apps/editor/src/
│
├── editor/
│   │
│   ├── core/                    # State Authority
│   │   ├── EditorCoordinator.ts    # Action orchestration
│   │   ├── EditorReducer.ts        # Pure state computation
│   │   ├── EditorStateReducer.ts   # State transitions
│   │   ├── EditorTypes.ts          # Type definitions
│   │   └── NodeEditorCore.tsx      # Core coordinator demo
│   │
│   ├── input/                   # Keyboard + Selection Ownership
│   │   ├── KeyboardHandlers.ts     # Keyboard event → logical action
│   │   ├── SelectionHandlers.ts    # Browser selection → logical cursor
│   │   └── domMapping.ts           # DOM ↔ logical position mapping
│   │
│   ├── view/                    # Rendering + Caret
│   │   ├── NodeEditor.tsx          # Main UI component
│   │   └── NodeView.tsx            # Single node renderer
│   │
│   ├── caret/                   # (Unchanged - left in place)
│   ├── observers/               # (Unchanged - left in place)
│   ├── extensions/              # (Empty - reserved for future)
│   ├── DOMObserver.ts
│   ├── EditorModel.index.ts
│   └── index.ts
│
└── engine/                      # Pure Data Operations
    ├── NodeKernel.ts               # Node manipulation
    ├── SegmentUtils.ts             # Segment utilities
    ├── SegmentOps.ts               # Segment operations
    ├── SegmentQuery.ts             # Query operations
    ├── SegmentedEditor.ts          # Text operations
    └── EditorState.ts              # State types
```

---

## 🔄 Keyboard Flow (Now Physically Traceable)

```
User presses Enter
    ↓
view/NodeEditor.tsx                 (UI layer - receives event)
    ↓
input/KeyboardHandlers.ts           (Translates event → action)
    ↓
core/EditorCoordinator.ts           (Orchestrates execution)
    ↓
core/EditorReducer.ts               (Pure state computation)
    ↓
engine/SegmentedEditor.ts           (Text manipulation)
    ↓
engine/SegmentOps.ts                (Low-level operations)
    ↓
view/NodeView.tsx                   (Renders updated state)
```

**This flow is now visible in the filesystem.**

---

## ✅ Verification Questions

### 1. Can you trace Enter key from event to state mutation in 5 clicks?

**YES.**

1. Click `view/NodeEditor.tsx` → See keyboard event handler
2. Click `input/KeyboardHandlers.ts` → See `handleKeyboardEvent`
3. Click `core/EditorCoordinator.ts` → See `executeAction`
4. Click `core/EditorReducer.ts` → See state computation
5. Click `engine/SegmentedEditor.ts` → See `handleSegmentedEnter`

**Flow is completely traceable.**

---

### 2. Can you explain which file owns cursor placement?

**YES.**

- **Logical cursor (state)**: `core/EditorReducer.ts`
- **DOM cursor (caret)**: `caret/CaretPlacement.tsx` (layout effect)
- **Browser selection → logical**: `input/domMapping.ts`

**Clear separation of concerns.**

---

### 3. Can you explain which file owns cursor calculation?

**YES.**

- **Offset calculation**: `engine/SegmentUtils.ts` (pure functions)
- **Position mapping**: `input/domMapping.ts` (DOM ↔ logical)
- **Caret intent**: `core/EditorTypes.ts` (type definition)

**Single source of truth per concern.**

---

### 4. Can you explain which file owns structural mutation?

**YES.**

- **Node-level**: `engine/NodeKernel.ts` (create, delete, move)
- **Segment-level**: `engine/SegmentOps.ts` (split, merge)
- **Text-level**: `engine/SegmentedEditor.ts` (input, backspace, enter)
- **State mutation**: `core/EditorReducer.ts` (single entry point)

**Clear hierarchy of mutation authority.**

---

## 📊 What Changed

### Files Moved

| From | To | Purpose |
|------|-----|---------|
| `handlers/KeyboardHandlers.ts` | `input/KeyboardHandlers.ts` | Keyboard ownership |
| `handlers/SelectionHandlers.ts` | `input/SelectionHandlers.ts` | Selection ownership |
| `selection/domMapping.ts` | `input/domMapping.ts` | Position mapping |
| `NodeEditor.tsx` | `view/NodeEditor.tsx` | UI layer |
| `NodeView.tsx` | `view/NodeView.tsx` | Rendering |
| `editor/SegmentOps.ts` | `engine/SegmentOps.ts` | Pure operations |
| `editor/SegmentQuery.ts` | `engine/SegmentQuery.ts` | Query operations |
| `editor/SegmentedEditor.ts` | `engine/SegmentedEditor.ts` | Text operations |

### Import Paths Updated

**All imports updated to reflect new structure.**

No logic changes. Only path updates.

---

## ❌ What Was NOT Touched

As requested, the following were **left in place**:

- `enforcement/` (untouched)
- `hardening/` (untouched)
- `DOMObserver.ts` (untouched)
- `caret/` RAF system (untouched)
- `grammar/` (untouched)
- `commands/` (untouched)
- `observers/` (untouched)

**These will be evaluated separately after keyboard architecture stabilizes.**

---

## 🎯 Goal Achieved

> **Keyboard architecture is now structurally correct and understandable.**

The execution flow is **physically visible** in the filesystem.

Next steps:
1. Audit keyboard flow surgically
2. Identify dead weight
3. Remove cross-layer timing hacks
4. Centralize authority further if needed

---

## 🔥 Why This Works

Before:
- Files scattered across unrelated folders
- Enforcement mixed with execution
- Caret systems in multiple layers
- **Flow required mental model**

After:
- Clear layer boundaries
- Input separate from execution
- View separate from state
- **Flow is visible in file structure**

---

## Git Status

All moves tracked as renames (R flag).
Zero deletions yet.
Zero logic changes.

```
R  handlers/KeyboardHandlers.ts -> input/KeyboardHandlers.ts
R  handlers/SelectionHandlers.ts -> input/SelectionHandlers.ts
R  ../selection/domMapping.ts -> input/domMapping.ts
RM ../NodeEditor.tsx -> view/NodeEditor.tsx
RM ../NodeView.tsx -> view/NodeView.tsx
R  SegmentOps.ts -> ../engine/SegmentOps.ts
R  SegmentQuery.ts -> ../engine/SegmentQuery.ts
R  SegmentedEditor.ts -> ../engine/SegmentedEditor.ts
```

**All imports verified. Build passes (modulo pre-existing test errors).**

---

## 📋 Ready for Surgical Audit

The keyboard pipeline is now:
- ✅ Structurally sound
- ✅ Physically traceable
- ✅ Layered correctly
- ✅ Import-verified

**Next: Identify and remove dead weight.**
