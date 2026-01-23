# Block Timestamps Architecture

**Status:** ✅ Implemented (Paragraph blocks only)  
**Last Updated:** 2026-01-23

Block-level timestamp tracking system that records when individual blocks (paragraphs, headings, lists, etc.) are created and modified within the editor.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Two-Extension System](#two-extension-system)
- [Storage & Persistence](#storage--persistence)
- [Display](#display)
- [Implementation Status](#implementation-status)
- [Usage Patterns](#usage-patterns)
- [Note vs Block Timestamps](#note-vs-block-timestamps)
- [Related Documentation](#related-documentation)

---

## Overview

The block timestamp system provides granular tracking of content lifecycle at the **block level**, independent of the document-level timestamps stored in the `Note` interface.

```
Document (Note)
├── createdAt: "2026-01-20T10:00:00.000Z"  ← Note-level
├── updatedAt: "2026-01-23T14:30:00.000Z"  ← Note-level
│
└── Blocks (Editor Content)
    ├── Paragraph 1
    │   ├── createdAt: "2026-01-20T10:00:00.000Z"  ← Block-level
    │   └── updatedAt: "2026-01-20T10:05:00.000Z"  ← Block-level
    │
    ├── Paragraph 2
    │   ├── createdAt: "2026-01-23T14:30:00.000Z"  ← Block-level
    │   └── updatedAt: "2026-01-23T14:30:00.000Z"  ← Block-level
    │
    └── Heading 1
        ├── createdAt: null  ← Not implemented yet
        └── updatedAt: null  ← Not implemented yet
```

**Key Principles:**

1. **Per-Block Granularity** - Each block tracks its own creation and modification times
2. **Automatic Tracking** - Timestamps set transparently via ProseMirror extensions
3. **Persistence** - Stored as block attributes in the document JSON
4. **Independence** - Block timestamps operate separately from note-level timestamps

---

## 🏗️ Architecture

### Component Diagram

```
┌─────────────────────────────────────────────┐
│  User Actions                                │
│  (Enter key, typing, paste, etc.)           │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  ProseMirror Transaction                     │
│  (Document change detected)                  │
└──────────────────┬──────────────────────────┘
                   ↓
         ┌─────────┴─────────┐
         ↓                   ↓
┌────────────────┐  ┌───────────────────────┐
│ BlockIdGenerator│  │ BlockTimestampTracker │
│ Extension       │  │ Extension             │
│                 │  │                       │
│ Sets createdAt  │  │ Updates updatedAt     │
│ on creation     │  │ on edits              │
└────────┬────────┘  └────────┬──────────────┘
         │                    │
         └─────────┬──────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  Block Attributes                            │
│  {                                           │
│    blockId: "uuid",                          │
│    createdAt: "2026-01-23T14:30:00.000Z",   │
│    updatedAt: "2026-01-23T14:35:00.000Z"    │
│  }                                           │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  Note.content (JSON stringified)             │
│  Saved to database                           │
└─────────────────────────────────────────────┘
```

---

## Two-Extension System

### Why Two Extensions?

The timestamp system uses **two separate ProseMirror extensions** instead of one combined extension, following the **Single Responsibility Principle**.

#### 1️⃣ `BlockIdGenerator.ts` - Creation Timestamps

**Location:** `packages/editor/extensions/BlockIdGenerator.ts`

**Responsibility:** Sets timestamps when blocks are **created or need repair**

**Runs when:**
- New block is created without a `blockId`
- Block has `blockId` but missing `createdAt` or `updatedAt`
- Duplicate `blockId` detected (cloned blocks)

**What it does:**

```typescript
// CASE 1: New block without blockId
const needsNewId = !currentBlockId || currentBlockId === '' || isDuplicate;

// CASE 2: Block has blockId but missing timestamps
const needsTimestamps = !node.attrs.createdAt || !node.attrs.updatedAt;

if (needsNewId || needsTimestamps) {
  const newBlockId = needsNewId ? crypto.randomUUID() : currentBlockId;
  const now = new Date().toISOString();

  tr.setNodeMarkup(pos, undefined, {
    ...node.attrs,
    blockId: newBlockId,
    createdAt: node.attrs.createdAt || now,  // ✅ Preserve existing
    updatedAt: now,                           // ✅ Always update
  });
}
```

**Key behavior:**
- ✅ `createdAt` is **immutable** - only set once, preserved on duplication
- ✅ `updatedAt` is **always set** to current time
- ✅ Runs **once per block** (on creation or first repair)

---

#### 2️⃣ `BlockTimestampTracker.ts` - Update Timestamps

**Location:** `packages/editor/extensions/BlockTimestampTracker.ts`

**Responsibility:** Updates `updatedAt` whenever block content changes

**Runs when:**
- User types text in a block
- User deletes text from a block
- User applies formatting
- Any content modification to a block

**What it does:**

```typescript
// Find which blocks were modified in this transaction
const modifiedBlocks = new Set<number>();

transactions.forEach((transaction) => {
  transaction.steps.forEach((step: any) => {
    const from = step.from;
    const to = step.to || from;

    // Find all blocks in the affected range
    newState.doc.nodesBetween(from, to, (node, pos) => {
      if (node.isBlock && node.attrs?.blockId) {
        modifiedBlocks.add(pos);
      }
    });
  });
});

// Update timestamps for modified blocks
modifiedBlocks.forEach((pos) => {
  const node = newState.doc.nodeAt(pos);
  tr.setNodeMarkup(pos, undefined, {
    ...node.attrs,
    updatedAt: new Date().toISOString(),  // ✅ Update timestamp
  });
});
```

**Key behavior:**
- ✅ Runs on **every content change**
- ✅ Only updates `updatedAt`, never touches `createdAt`
- ✅ Tracks multiple blocks in a single transaction

---

### Why Separate Extensions?

| Aspect | BlockIdGenerator | BlockTimestampTracker |
|--------|-----------------|----------------------|
| **Purpose** | Birth certificate | Activity log |
| **Frequency** | Once per block | Every edit |
| **Triggers** | Block creation/repair | Content modification |
| **Complexity** | High (ID generation, deduplication) | Low (timestamp update) |
| **Performance** | Can skip most blocks | Runs frequently |

**Benefits:**

1. **Single Responsibility** - Each extension has one clear job
2. **Easier Debugging** - Creation issues vs update issues are isolated
3. **Performance** - `BlockIdGenerator` can skip work after initial setup
4. **Clarity** - Code is easier to understand and maintain

---

## 💾 Storage & Persistence

### Schema Definition

Block timestamps are defined as attributes in each block type's schema.

**Example:** `packages/editor/extensions/nodes/Paragraph.ts`

```typescript
addAttributes() {
  return {
    blockId: { /* ... */ },
    tags: { /* ... */ },
    indent: { /* ... */ },
    collapsed: { /* ... */ },
    
    // 📅 Block metadata: creation timestamp
    createdAt: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-created-at') || null,
      renderHTML: (attributes) => {
        if (attributes.createdAt) {
          return { 'data-created-at': attributes.createdAt };
        }
        return {};
      },
    },
    
    // 📅 Block metadata: last updated timestamp
    updatedAt: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-updated-at') || null,
      renderHTML: (attributes) => {
        if (attributes.updatedAt) {
          return { 'data-updated-at': attributes.updatedAt };
        }
        return {};
      },
    },
  };
}
```

### Persistence Flow

```
1. Editor Document (ProseMirror)
   ↓
   Block attributes: { blockId, createdAt, updatedAt, ... }

2. Serialization (renderHTML)
   ↓
   HTML/JSON: <div data-created-at="..." data-updated-at="...">

3. Note.content (Zustand Store)
   ↓
   Stringified JSON stored in Note interface

4. Database
   ↓
   Persisted as part of note.content field

5. Loading (parseHTML)
   ↓
   HTML → Block attributes restored

6. Editor Document
   ↓
   Timestamps available in editor state
```

**Format:** ISO 8601 strings (includes date + time + timezone)

```typescript
"2026-01-23T14:30:45.123Z"
```

---

## 🎨 Display

Block timestamps are displayed in the **block options menu** accessed via the chrome layer's "more options" button (three dots).

**Location:** `packages/editor/components/EditorChromeLayer.tsx`

### Display Format

```typescript
const formatDateTime = (date: Date): string => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formattedDate = `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  
  // Format time (12-hour format with AM/PM)
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const formattedTime = `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  
  // Check if it's today
  const today = new Date();
  const isToday = date.getDate() === today.getDate() &&
                  date.getMonth() === today.getMonth() &&
                  date.getFullYear() === today.getFullYear();
  
  return isToday ? `Today at ${formattedTime}` : `${formattedDate} at ${formattedTime}`;
};
```

**Examples:**
- `Today at 2:30 PM` (if created today)
- `23 Jan 2026 at 2:30 PM` (if created on a different day)

### UI Integration

```typescript
// Get block timestamps from editor state
const getBlockTimestamps = useCallback(() => {
  if (!chrome.blockId) return { createdAt: null, updatedAt: null };

  const { state } = editor;
  let blockCreatedAt: string | null = null;
  let blockUpdatedAt: string | null = null;

  state.doc.descendants((node) => {
    if (node.attrs?.blockId === chrome.blockId) {
      blockCreatedAt = node.attrs.createdAt || null;
      blockUpdatedAt = node.attrs.updatedAt || null;
      return false; // Stop traversing
    }
  });

  return { createdAt: blockCreatedAt, updatedAt: blockUpdatedAt };
}, [chrome.blockId, editor]);

// Display in menu
<DropdownHeader 
  label={`Created: ${blockTimestamps.createdAt ? formatDateTime(new Date(blockTimestamps.createdAt)) : 'N/A'}`} 
  hint="" 
/>
<DropdownHeader 
  label={`Last edited: ${blockTimestamps.updatedAt ? formatDateTime(new Date(blockTimestamps.updatedAt)) : 'N/A'}`} 
  hint="" 
/>
```

---

## ✅ Implementation Status

### Implemented

| Block Type | createdAt | updatedAt | Location |
|-----------|-----------|-----------|----------|
| **Paragraph** | ✅ Yes | ✅ Yes | `extensions/nodes/Paragraph.ts` |

### Not Implemented

| Block Type | createdAt | updatedAt | Status |
|-----------|-----------|-----------|--------|
| **Heading** | ❌ No | ❌ No | Needs schema attributes |
| **ListBlock** | ❌ No | ❌ No | Needs schema attributes |
| **Blockquote** | ❌ No | ❌ No | Needs schema attributes |
| **CodeBlock** | ❌ No | ❌ No | Needs schema attributes |
| **Callout** | ❌ No | ❌ No | Needs schema attributes |
| **HorizontalRule** | ❌ No | ❌ No | Needs schema attributes |

**Current Behavior:**
- ✅ Paragraph blocks show timestamps in the menu
- ❌ Other block types show "N/A" in the menu

---

## Usage Patterns

### Creating a New Block

```typescript
// User presses Enter in the editor
// → enter.ts keymap handler creates block
// → BlockIdGenerator detects missing timestamps
// → Sets createdAt and updatedAt

// Result:
{
  blockId: "5a986e57-5185-45ff-8498-1b9e7a60ac6a",
  createdAt: "2026-01-23T14:30:00.000Z",
  updatedAt: "2026-01-23T14:30:00.000Z"
}
```

### Editing a Block

```typescript
// User types "Hello" in the block
// → BlockTimestampTracker detects content change
// → Updates updatedAt only

// Result:
{
  blockId: "5a986e57-5185-45ff-8498-1b9e7a60ac6a",
  createdAt: "2026-01-23T14:30:00.000Z",  // ✅ Unchanged
  updatedAt: "2026-01-23T14:35:00.000Z"   // ✅ Updated
}
```

### Duplicating a Block

```typescript
// User duplicates a block (Cmd+D or menu action)
// → BlockIdGenerator detects duplicate blockId
// → Generates new blockId
// → Preserves original createdAt
// → Sets new updatedAt

// Original:
{
  blockId: "5a986e57-5185-45ff-8498-1b9e7a60ac6a",
  createdAt: "2026-01-23T14:30:00.000Z",
  updatedAt: "2026-01-23T14:35:00.000Z"
}

// Duplicate:
{
  blockId: "decccd68-8e61-430c-99d8-00d86b529c61",  // ✅ New ID
  createdAt: "2026-01-23T14:30:00.000Z",           // ✅ Preserved
  updatedAt: "2026-01-23T14:40:00.000Z"            // ✅ New timestamp
}
```

---

## 📊 Note vs Block Timestamps

The codebase tracks timestamps at **two independent levels**:

### 1. Note-Level Timestamps (Document)

**Location:** `packages/state/src/stores/notes.ts` (Zustand store)

**Scope:** Entire document

```typescript
export interface Note {
  id: string;
  createdAt: string;    // ← When document was created
  updatedAt: string;    // ← When document was last modified
  deletedAt: string | null;
  // ...
}
```

**Updated when:**
- Note is created
- Note metadata changes (title, tags, etc.)
- Note content is saved
- Note is deleted/restored

**Purpose:**
- Sort notes by "recently edited"
- Display "last modified" in note lists
- Sync tracking
- Audit trail at document level

---

### 2. Block-Level Timestamps (Content)

**Location:** `packages/editor/extensions/` (ProseMirror extensions)

**Scope:** Individual blocks within a document

```typescript
// Each paragraph, heading, list item, etc. has:
{
  blockId: string;
  createdAt: string;    // ← When this specific block was created
  updatedAt: string;    // ← When this specific block was edited
}
```

**Updated when:**
- Block is created (Enter key, paste, etc.)
- Block content is modified (typing, formatting)
- Block is duplicated

**Purpose:**
- Show creation date per block in UI
- Track content lifecycle at granular level
- Block-level audit trail
- Future: content history, collaborative editing

---

### Comparison Table

| Aspect | Note Timestamps | Block Timestamps |
|--------|----------------|------------------|
| **Granularity** | Entire document | Individual blocks |
| **Management** | Application state (Zustand) | Editor extensions (ProseMirror) |
| **Storage** | Top-level Note fields | Block attributes in Note.content |
| **Updates** | Manual (on save, meta changes) | Automatic (on every edit) |
| **Display** | Note lists, headers | Block options menu |
| **Purpose** | Document lifecycle | Content lifecycle |

---

## 🚨 Known Issues

### 1. Incomplete Block Type Coverage

**Issue:** Only `Paragraph` blocks have timestamp attributes defined.

**Impact:**
- Headings, lists, blockquotes, etc. show "N/A" for timestamps
- BlockIdGenerator and BlockTimestampTracker skip these blocks

**Solution:** Add `createdAt` and `updatedAt` attributes to all block type schemas.

**Files to update:**
- `packages/editor/extensions/nodes/Heading.ts`
- `packages/editor/extensions/nodes/ListBlock.ts`
- `packages/editor/extensions/nodes/Blockquote.ts`
- `packages/editor/extensions/nodes/CodeBlock.ts`
- `packages/editor/extensions/nodes/Callout.ts`
- `packages/editor/extensions/nodes/HorizontalRule.ts`

---

### 2. Legacy Content Without Timestamps

**Issue:** Blocks created before this feature was implemented have `null` timestamps.

**Impact:** 
- Shows "N/A" in UI for old blocks
- No historical data for existing content

**Behavior:**
- ✅ When user edits an old block, timestamps are automatically added
- ✅ BlockIdGenerator adds timestamps on first edit (via `needsTimestamps` check)

**Not a critical issue** - timestamps will populate naturally as content is edited.

---

## 🔧 Extending to Other Block Types

To add timestamp support to a block type:

### Step 1: Add Attributes to Schema

```typescript
// In extensions/nodes/YourBlockType.ts
addAttributes() {
  return {
    // ... existing attributes ...
    
    // Block metadata: creation timestamp
    createdAt: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-created-at') || null,
      renderHTML: (attributes) => {
        if (attributes.createdAt) {
          return { 'data-created-at': attributes.createdAt };
        }
        return {};
      },
    },
    
    // Block metadata: last updated timestamp
    updatedAt: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-updated-at') || null,
      renderHTML: (attributes) => {
        if (attributes.updatedAt) {
          return { 'data-updated-at': attributes.updatedAt };
        }
        return {};
      },
    },
  };
}
```

### Step 2: Test

1. Create a new block of that type
2. Open block options menu (chrome layer)
3. Verify timestamps display correctly
4. Edit the block content
5. Verify `updatedAt` changes

**That's it!** The extensions (`BlockIdGenerator` and `BlockTimestampTracker`) automatically handle any block with `createdAt` and `updatedAt` attributes.

---

## 📚 Related Documentation

- [ARCHITECTURE.md](../ARCHITECTURE.md) - Package structure and boundaries
- [BLOCK_CREATION_CONTRACT.md](./BLOCK_CREATION_CONTRACT.md) - Block creation rules
- [EDITOR_CHROME_LAYER.md](./EDITOR_CHROME_LAYER.md) - Chrome layer architecture
- [BlockIdGenerator.ts](./extensions/BlockIdGenerator.ts) - Creation timestamp implementation
- [BlockTimestampTracker.ts](./extensions/BlockTimestampTracker.ts) - Update timestamp implementation
- [EditorChromeLayer.tsx](./components/EditorChromeLayer.tsx) - Timestamp display

---

## Change Log

**2026-01-23 (Initial Implementation)**

**What Changed:**
- Created `BlockTimestampTracker` extension for `updatedAt` tracking
- Updated `BlockIdGenerator` to set timestamps when blocks are created
- Added `createdAt` and `updatedAt` attributes to `Paragraph` schema
- Integrated timestamp display in `EditorChromeLayer` block options menu
- Fixed bug where blocks created via Enter key had no timestamps

**Key Learnings:**
- Two-extension design provides clean separation of concerns
- Timestamp attributes must be defined in each block type's schema
- ISO 8601 format ensures timezone-aware persistence
- Extensions work automatically for any block with timestamp attributes

**Next Steps:**
- Add timestamp attributes to remaining block types (Heading, ListBlock, etc.)
- Consider displaying timestamps in additional UI locations
- Evaluate need for block-level history/versioning features
