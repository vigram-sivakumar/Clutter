---
name: editor-architecture
description: Architectural rules for the ProseMirror/TipTap Notion-style editor. Use when working on editor blocks, chrome layer, block creation, hover detection, indent handling, transactions, keyboard handlers, floating UI, or any editor-related features. Enforces flat document model, chrome overlay architecture, block creation contract, and DOM stability patterns.
---

# ProseMirror/TipTap Editor Architecture

This editor follows a Notion/Craft-style flat document architecture. **All architectural decisions must comply with the rules below.**

## Quick Reference

| Concept | Rule |
|---------|------|
| **Document structure** | Flat, no nesting or hierarchy |
| **Block attributes** | `type` and `indent` only |
| **Indent** | Visual/layout only, not structural |
| **Block creation** | ALWAYS use `createBlockNode()` or `createCleanBlockAttrs()` |
| **Block updates** | ALWAYS use `updateBlockAttrs()`, NEVER pass `blockId` |
| **Transaction ownership** | Only `@clutter/editor` may manipulate transactions |
| **Chrome layer** | Single overlay, absolutely positioned sibling |
| **Hover detection** | Container-level `mousemove`, NEVER on NodeViews |
| **Cursor semantics** | Only `.ProseMirror` has `cursor: text` |
| **Chrome interaction** | `pointer-events: none` on root, `auto` on buttons |
| **Keyboard handlers** | ALWAYS wrap with `withUISafety()` |
| **Floating UI** | Components provide anchors, FloatingMenu applies policy |

---

## 0. Block Creation Contract

### 🔒 THE GOLDEN RULE

**ALL block creation MUST go through centralized creation functions.**

❌ **NEVER** call `schema.nodes.X.create()` directly  
✅ **ALWAYS** use `createBlockNode()` or `createCleanBlockAttrs()`

### The Three Creation Functions

#### 1️⃣ `createBlockNode()` - Primary Creation Path

**Use when:** Creating a NEW block from scratch

```typescript
import { createBlockNode } from '../domain/createBlock';

// ✅ Creating a new paragraph
const para = createBlockNode(schema, {
  type: 'paragraph',
  indent: 0,
});

// ✅ Creating a heading with content
const heading = createBlockNode(schema, {
  type: 'heading',
  headingLevel: 2,
  indent: 1,
  content: existingFragment,
});
```

**What it does:**
- ✅ Generates new `blockId` (crypto.randomUUID())
- ✅ Sets default `indent` (0)
- ✅ Sets default `collapsed` (false)
- ✅ Applies type-specific defaults
- ✅ Type-safe via TypeScript generics

#### 2️⃣ `createCleanBlockAttrs()` - Cloning Existing Blocks

**Use when:** Creating a NEW block based on an EXISTING block's attributes

```typescript
import { createCleanBlockAttrs } from '../domain/createBlock';

// ✅ Creating a sibling with same type
const cleanAttrs = createCleanBlockAttrs(node, node.attrs.indent);
tr.insert(pos, node.type.create(cleanAttrs));

// ✅ Creating a child (indent + 1)
const childAttrs = createCleanBlockAttrs(node, node.attrs.indent + 1);
tr.insert(pos, node.type.create(childAttrs));
```

**What it does:**
- ✅ Generates **NEW** `blockId` (never reuses old ID!)
- ✅ Whitelists only structural attributes (indent, listType, calloutType)
- ❌ **Filters out** transient state (collapsed, checked, tags)

#### 3️⃣ `updateBlockAttrs()` - Updating Existing Blocks

**Use when:** Modifying attributes of an EXISTING block

```typescript
import { updateBlockAttrs } from '../domain/updateBlockAttrs';

// ✅ Changing indent
updateBlockAttrs(tr, blockPos, { indent: 2 });

// ✅ Toggling collapse
updateBlockAttrs(tr, blockPos, { collapsed: true });

// ❌ NEVER pass blockId (will throw error!)
updateBlockAttrs(tr, blockPos, { blockId: newId }); // 💥 Error!
```

**What it does:**
- ✅ Updates ONLY the specified attributes
- ✅ Preserves existing `blockId` (immutable!)
- 🔒 Throws error if you try to change `blockId`

### Decision Tree

```
Are you creating NEW or updating EXISTING?
│
├─ NEW BLOCK
│  │
│  ├─ Know type at compile time?
│  │  ├─ YES → Use createBlockNode() ✅
│  │  └─ NO → Use createCleanBlockAttrs() ✅
│  │
│  └─ Have source block to clone?
│     ├─ YES → Use createCleanBlockAttrs() ✅
│     └─ NO → Use createBlockNode() ✅
│
└─ EXISTING BLOCK
   └─ Use updateBlockAttrs() ✅
      (Never include blockId!)
```

### Anti-Patterns

#### ❌ Manual `.create()` Calls

```typescript
// ❌ BAD: Bypasses blockId assignment
state.schema.nodes.paragraph.create({ indent: 0 });

// ❌ BAD: Creates temporal identity gap
tr.replaceWith(pos, pos + size, schema.nodes.paragraph.create({}));
```

**Why wrong:** No `blockId` assigned at creation time, violates eager assignment invariant

#### ❌ Passing `blockId` to `updateBlockAttrs()`

```typescript
// ❌ BAD: Trying to change block identity
const cleanAttrs = createCleanBlockAttrs(node, newIndent);
updateBlockAttrs(tr, blockPos, cleanAttrs); // 💥 Contains blockId!
```

**Why wrong:** `blockId` is **immutable** after creation

**The fix:**
```typescript
// ✅ GOOD: Pass only changed attributes
updateBlockAttrs(tr, blockPos, { indent: newIndent });
```

### Enforcement

- **TypeScript types** - `createBlockNode()` enforces type-specific attributes
- **Runtime validation** - `updateBlockAttrs()` throws error if `blockId` passed
- **ESLint rule** - `no-manual-block-create` prevents manual `.create()` calls

---

## 1. Block Model

### Core Principle
The document is **completely flat**. Blocks exist in a single linear sequence.

### Rules
- ✅ Blocks have only: `type` (paragraph, heading, etc.) and `indent` (number)
- ✅ Every block MUST have a `blockId` (assigned eagerly at creation)
- ✅ Heading "level" is purely typographic styling
- ❌ No parent/child relationships between blocks
- ❌ No hierarchy or tree structures
- ❌ No nesting of blocks
- ❌ `blockId` is immutable after creation

### Implementation
```typescript
// ✅ Correct: Flat structure with blockId
{ type: 'paragraph', attrs: { blockId: 'abc-123', indent: 0 } }
{ type: 'heading', attrs: { blockId: 'def-456', indent: 1, level: 1 } }
{ type: 'paragraph', attrs: { blockId: 'ghi-789', indent: 1 } }

// ❌ Wrong: Nested structure
{ type: 'heading', children: [/* blocks */] }

// ❌ Wrong: Missing blockId
{ type: 'paragraph', attrs: { indent: 0 } }
```

---

## 2. Indent vs Level

### Core Principle
`indent` is a **layout attribute**, not a structural relationship.

### Rules
- ✅ Indent controls visual indentation (spacing/margin)
- ✅ All blocks at any indent level remain siblings in the document
- ❌ Never interpret indent as parent/child hierarchy
- ❌ Never nest ProseMirror nodes to represent indent
- ❌ Never convert indent into structural depth

### When Adding Features
If a feature requires understanding "which blocks are under a heading":
1. Traverse the flat list forward from the heading
2. Collect blocks with `indent > heading.indent`
3. Stop when you hit a block with `indent <= heading.indent`
4. **Never restructure the document**

---

## 3. Chrome Architecture

### Core Principle
Chrome is a **single overlay layer**, completely separate from editor content. Hover detection is **container-level**, never on NodeViews.

### 🎓 THE ARCHITECTURAL RULE (LOCK FOREVER)

> **Never attach hover state to a ProseMirror NodeView. Ever.**
> 
> NodeViews are ephemeral. Containers are stable.
> 
> This is not an optimization. This is architectural correctness.

### Rules

#### Structure
- ✅ Chrome is mounted as an absolutely positioned sibling to `.ProseMirror`
- ✅ Chrome is a single component (EditorChromeLayer) with one ChromeRow
- ✅ Chrome is always mounted (never unmounted)
- ✅ Visibility controlled by opacity (0 or 1)
- ❌ Chrome is NOT inside block DOM
- ❌ Chrome is NOT inside contenteditable regions
- ❌ No per-block chrome components
- ❌ Never unmount chrome on hide

#### Hover Detection
- ✅ ONE `mousemove` listener on stable editor container
- ✅ Use `event.target.closest('[data-block-id]')` to find hovered block
- ✅ Blocks have `data-block-id` attribute (detection anchor)
- ❌ NEVER attach `onPointerEnter/Leave` to NodeViewWrapper
- ❌ NEVER attach hover handlers to blocks
- ❌ NEVER use geometry calculations for hover detection
- ❌ NEVER use RAF for hover detection

#### Positioning
- ✅ Ref-based positioning (scroller-safe)
- ✅ `useLayoutEffect` for instant positioning (before paint)
- ✅ Atomic state updates (position + visibility together)
- ✅ GPU-accelerated transforms (`translate()`)
- ❌ No `closest()` for positioning (use refs)
- ❌ No `useEffect` for positioning (causes lag)

#### State
- ✅ Minimal state: `{ blockId, top, visible }`
- ✅ Opacity-based visibility (smooth transitions)
- ✅ `pointerEvents: 'none'` when hidden
- ❌ No per-block hover state
- ❌ No lock mechanisms
- ❌ No debouncing or timers for hover

### Structure
```
<EditorContainer ref={containerRef}>  <!-- Stable, never replaced -->
  <div className="ProseMirror">
    <NodeViewWrapper data-block-id="abc-123">  <!-- NO hover handlers -->
      <NodeViewContent />
    </NodeViewWrapper>
  </div>
  <EditorChromeLayer containerRef={containerRef}>  <!-- Sibling -->
    <ChromeRow />  <!-- One row, always mounted, opacity-controlled -->
  </EditorChromeLayer>
</EditorContainer>
```

### Hover Implementation Pattern

**Container-level detection (EditorChromeLayer):**

```typescript
useEffect(() => {
  const container = containerRef.current;
  if (!container) return;

  let lastBlockId: string | null = null;

  const handleMouseMove = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const row = target?.closest('[data-block-id]') as HTMLElement | null;
    const blockId = row?.dataset.blockId ?? null;

    // Only update if block changed (avoid spam)
    if (blockId !== lastBlockId) {
      setHoveredBlockId(blockId);
      lastBlockId = blockId;
    }
  };

  const handleMouseLeave = () => {
    setHoveredBlockId(null);
    lastBlockId = null;
  };

  container.addEventListener('mousemove', handleMouseMove);
  container.addEventListener('mouseleave', handleMouseLeave);

  return () => {
    container.removeEventListener('mousemove', handleMouseMove);
    container.removeEventListener('mouseleave', handleMouseLeave);
  };
}, [containerRef]);
```

**Block structure (ParagraphBlock, Heading, etc.):**

```typescript
<NodeViewWrapper
  data-block-id={node.attrs.blockId}  // ✅ Detection anchor
  // ❌ NO onPointerEnter/Leave
  // ❌ NO hover handlers
  // ❌ NO state
>
  <NodeViewContent />
</NodeViewWrapper>
```

### Why NodeView Hover Handlers Fail

**ProseMirror NodeViews are NOT stable DOM nodes.** They are replaced during:
- Selection updates
- Decoration changes
- Content mutations
- Caret movement

**When a DOM node is replaced while cursor is over it:**
1. Browser fires `pointerleave` (old node destroyed)
2. New node mounted at same position
3. Browser fires `pointerenter` (new node created)
4. **This happens even though mouse never moved**

**Result:** Console spam, constant flicker, false events

**Solution:** Container-level `mousemove` survives DOM replacements because:
- `mousemove` fires on actual movement, not DOM changes
- `closest()` queries fresh on every move
- Container never gets replaced
- No identity attached to ephemeral NodeViews

---

## 3A. Transaction Mutation Ownership

### 🔒 CRITICAL ARCHITECTURAL RULE

**Only `@clutter/editor` may manipulate ProseMirror transactions.**

This rule ensures data integrity, prevents attribute loss, and maintains clear boundaries.

### What This Means

**✅ Editor Package (`@clutter/editor`):**
- ✅ May create and mutate ProseMirror transactions
- ✅ May call `tr.setNodeMarkup`, `tr.delete`, `tr.insert`, etc.
- ✅ May import from `@tiptap/pm/state`, `@tiptap/pm/model`
- ✅ Must use centralized functions: `updateBlockAttrs()`, `createBlockNode()`

**❌ UI Package (`@clutter/ui`):**
- ❌ May NOT manipulate ProseMirror transactions directly
- ❌ May NOT call `tr.setNodeMarkup` or other transaction methods
- ❌ May NOT import from `@tiptap/pm/state`
- ✅ Must call editor commands or APIs only
- ✅ Stays in React/presentation layer

**❌ Other Packages (`@clutter/domain`, `@clutter/state`, `@clutter/shared`):**
- ❌ May NOT import ProseMirror types or manipulate transactions
- ✅ Define pure types and business logic only

### Enforcement

1. **Centralized Mutation APIs** - `updateBlockAttrs()`, `createBlockNode()` are single sources of truth
2. **ESLint Boundaries** - Editor cannot import domain/state/shared, UI limited to commands
3. **Code Review** - Any `setNodeMarkup` call outside editor triggers review

### Why This Matters

**Without this rule:**
- ❌ Attribute loss (especially `blockId`)
- ❌ Invariant violations scattered across packages
- ❌ Difficult debugging (who changed what?)

**With this rule:**
- ✅ Single source of truth for mutations
- ✅ Invariants enforced centrally
- ✅ Clear ownership and debugging

---

## 3B. Keyboard Handler Architecture

### 🔒 GOLDEN RULES

#### Rule 1: UI Intent Always Wins

Structural handlers (Enter, Tab, Backspace) must never consume keys when UI components (menus, dropdowns, pickers) are active.

```typescript
// ✅ CORRECT: UI handlers take precedence automatically
export const handleEnter = withUISafety(handleEnterImpl, 'handleEnter');

// ❌ WRONG: Manual check (fragile, easy to forget)
export function handleEnter(editor: Editor): boolean {
  if (editor.storage.slashCommands?.isOpen) return false;
  // ...
}
```

#### Rule 2: Mandatory Wrapper

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

#### Rule 3: Single Source of Truth

**UI intent is declared in EXACTLY ONE place: `uiIntent.ts`**

```typescript
// ✅ CORRECT: Register in uiIntent.ts
const UI_HANDLERS: readonly UIHandlerConfig[] = [
  {
    name: 'slashCommands',
    isActive: (editor) => editor.storage.slashCommands?.isOpen ?? false,
    priority: 10000,
  },
];

// ❌ WRONG: Direct storage check in handler
if (editor.storage.slashCommands?.isOpen) return false;
```

#### Rule 4: Handler Return Contract

```typescript
// ✅ CORRECT
function handleEnterImpl(editor: Editor): boolean {
  tr.insert(pos, newNode);
  view.dispatch(tr);
  return true; // ✅ Key consumed, transaction dispatched
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

### Adding a New UI Component

**Step 1: Register in `uiIntent.ts`**

```typescript
export type UIIntentType = 'slashCommands' | 'atMention' | 'myNewPicker';

const UI_HANDLERS: readonly UIHandlerConfig[] = [
  {
    name: 'myNewPicker',
    isActive: (editor) => editor.storage.myNewPicker?.open ?? false,
    priority: 10000,
  },
];
```

**Step 2: Done!** All existing handlers automatically defer to your component.

### Anti-Patterns

- ❌ Don't manually check UI state in handlers
- ❌ Don't adjust priorities to fix conflicts
- ❌ Don't export unwrapped handlers
- ❌ Don't return `true` without dispatching transaction

---

## 3C. Floating UI Architecture

### Core Principle: Anchor vs Layout Policy

**Components provide intent (anchors), FloatingMenu applies policy (flip, clamp, measure).**

### Rules

- ✅ Application components calculate **where they want** the menu
- ✅ FloatingMenu decides **where the menu actually appears**
- ✅ FloatingMenu measures actual dimensions (never hardcoded)
- ✅ FloatingMenu handles flip (above/below), clamp (horizontal), viewport
- ❌ NEVER hardcode dimensions in components (no `const width = 400`)
- ❌ NEVER do flip logic in components
- ❌ NEVER do viewport clamping in components

### Example: FloatingToolbar

**❌ Wrong (Layout Policy in Component):**

```typescript
// Component doing layout math
const toolbarWidth = 400; // ❌ Hardcoded
const toolbarHeight = 48; // ❌ Hardcoded

// Clamp to viewport
const minLeft = toolbarWidth / 2 + 16;
const maxLeft = window.innerWidth - toolbarWidth / 2 - 16;
left = Math.max(minLeft, Math.min(maxLeft, left)); // ❌ Policy

// Flip decision
if (top < 8) {
  top = end.bottom + 8; // ❌ Policy
}
```

**✅ Correct (Pure Anchor Calculation):**

```typescript
// Component provides anchor only
const left = (start.left + end.left) / 2; // Horizontal center
const top = start.top; // Selection top
const bottom = end.bottom; // Selection bottom

// Get boundary for clamping
const boundaryRect = editor.view.dom
  .closest('.content-wrapper')
  ?.getBoundingClientRect();

// FloatingMenu handles all layout policy
<FloatingMenu
  isOpen={isVisible}
  position={{ top, left, bottom }}
  boundaryRect={boundaryRect}
>
  <div>{/* Toolbar content */}</div>
</FloatingMenu>
```

### Why This Matters

1. **No Hardcoded Dimensions** - Menu measures itself dynamically
2. **No Duplicate Logic** - All positioning in one place
3. **Declarative API** - "Show at this anchor" vs "flip here, clamp there"
4. **Consistent Behavior** - All menus/toolbars follow same rules

### Responsibility Table

| Concern | Owner | Location |
|---------|-------|----------|
| **Portal rendering** | FloatingContainer | Foundation |
| **ESC dismissal** | FloatingMenu | Foundation |
| **Scroll locking** | FloatingMenu | Foundation |
| **Vertical flip** | FloatingMenu | Foundation |
| **Horizontal clamping** | FloatingMenu | Foundation |
| **Dimension measurement** | FloatingMenu | Foundation |
| **Anchor calculation** | Component | Application |

---

## 4. Pointer & Cursor Semantics

### Core Principle
Maintain clear text editing semantics. Chrome must not interfere with cursor behavior.

### Rules
- ✅ Only `.ProseMirror` has `cursor: text`
- ✅ Chrome root uses `pointer-events: none`
- ✅ Only actual interactive elements (buttons) use `pointer-events: auto`
- ❌ Chrome containers must never have text cursor
- ❌ No `preventDefault` hacks to work around pointer issues
- ❌ Chrome must not block text selection

### CSS Pattern
```css
.chrome-layer {
  pointer-events: none;  /* Root is non-interactive */
}

.chrome-button {
  pointer-events: auto;  /* Only buttons can be clicked */
  cursor: pointer;       /* Button cursor, not text */
}
```

---

## 5. Hover Detection

### Core Principle
Hover is detected from the block's DOM, not from geometry calculations or chrome position.

### Rules
- ✅ Use hover events on block DOM elements
- ✅ OR use dedicated hover-only gutter divs inside blocks
- ✅ Chrome positioning derives from block rects after hover is detected
- ✅ `requestAnimationFrame` is allowed for positioning updates
- ✅ Geometry math is allowed ONLY for positioning chrome, not detecting hover
- ❌ No hover detection based on mouse coordinates and block measurements
- ❌ No geometry-based hover timers or debouncing

### Implementation Pattern
```typescript
// ✅ Correct: Hover detection from DOM
<BlockComponent onMouseEnter={handleHover}>

// ✅ Also correct: Dedicated hover gutter
<HoverGutter onMouseEnter={handleHover} />

// ❌ Wrong: Geometry-based detection
const isHovered = mouseY >= blockTop && mouseY <= blockBottom;
```

---

## 6. Anti-Flicker Rules

### Core Principle
State updates must be atomic to prevent visual flickering of chrome elements.

### Rules
- ✅ Update all related chrome state in a single atomic operation
- ✅ Use a single chrome component managing all visible elements
- ✅ Derive chrome visibility from a single source of truth
- ❌ No independent toggling of multiple chrome states
- ❌ No per-block chrome components with separate state
- ❌ No geometry-based hover timers that can cause state thrashing

### State Pattern
```typescript
// ✅ Correct: Atomic state update
setChromeState({
  hoveredBlock: blockId,
  visibleHandle: true,
  handlePosition: rect
});

// ❌ Wrong: Multiple separate updates
setHoveredBlock(blockId);
setVisibleHandle(true);
setHandlePosition(rect);
```

---

## 7. Block Creation

### Core Principle
Creating a block means inserting a new flat node into the document.

### Rules
- ✅ New blocks are inserted at a position in the flat sequence
- ✅ New blocks inherit the current block's `indent` by default
- ✅ All block types (paragraph, heading, etc.) follow the same insertion path
- ❌ No schema changes when adding new block types
- ❌ No special nesting or wrapping logic for new blocks

### Implementation
```typescript
// ✅ Correct: Insert flat block
transaction.insert(pos, schema.nodes.paragraph.create({
  indent: currentBlock.attrs.indent
}));

// ❌ Wrong: Nesting or hierarchy
transaction.wrap(range, schema.nodes.container.create());
```

---

## 8. Anti-Patterns (Never Suggest These)

When proposing solutions, **immediately reject** any approach that includes:

### Block Model Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|--------------|----------------|------------------|
| Nested blocks | Violates flat document model | Keep all blocks as siblings |
| Tree structures | Blocks are siblings, not parent/child | Use indent for visual hierarchy |
| Levels based on indent | Indent is layout, not structure | Indent is just a number attribute |
| Converting indent to depth | Breaks the flat model | Traverse flat list to find "children" |
| Wrapping nodes for indentation | Structural change for layout | Use CSS padding/margin |

### Block Creation Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|--------------|----------------|------------------|
| `schema.nodes.X.create()` directly | Bypasses blockId assignment | Use `createBlockNode()` |
| Passing `blockId` to `updateBlockAttrs()` | BlockId is immutable | Never pass blockId in updates |
| Reusing blockId from cloned block | Creates identity collision | `createCleanBlockAttrs()` generates new ID |
| Lazy blockId assignment | Temporal identity gap | Eager assignment at creation |
| No transaction after `return true` | Consumes key without action | Always dispatch before returning true |

### Chrome Architecture Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|--------------|----------------|------------------|
| Per-block chrome components | Causes flicker and state issues | Single chrome overlay |
| Hover handlers on NodeViews | NodeViews are replaced frequently | Container-level mousemove |
| `onPointerEnter/Leave` on blocks | False events on DOM replacement | `event.target.closest('[data-block-id]')` |
| Geometry-based hover detection | Measuring every block on hover | DOM events from stable container |
| Unmounting chrome on hide | Causes remount jank | Opacity-based visibility |
| Multiple chrome state updates | Causes snap/lag effect | Atomic state updates |
| `useEffect` for positioning | 1-frame lag | `useLayoutEffect` for instant |
| `closest()` for positioning | Breaks across React boundaries | Ref-based positioning |
| Hover locks or debouncing | Fighting DOM instability | Fix the root cause (container hover) |
| RAF for hover detection | Wrong tool for the job | RAF for positioning only |

### Cursor & Interaction Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|--------------|----------------|------------------|
| `cursor: text` on chrome | Chrome inherits text semantics | Only `.ProseMirror` has cursor:text |
| Chrome inside contenteditable | Browser applies text behaviors | Chrome as sibling outside |
| `preventDefault` hacks on chrome | Working around wrong structure | DOM isolation fixes it |
| `pointerEvents: auto` on chrome root | Blocks clicks to editor | `none` on root, `auto` on buttons |

### Keyboard Handler Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|--------------|----------------|------------------|
| Manual UI state checks in handlers | Fragile, easy to forget | `withUISafety()` wrapper |
| Unwrapped keyboard handlers | No UI precedence enforcement | Always wrap with `withUISafety()` |
| Adjusting priorities to fix conflicts | Doesn't solve root cause | Register UI in `uiIntent.ts` |
| Returning `true` without dispatch | Consumes key without action | Always dispatch transaction |
| UI checks scattered across handlers | Inconsistent, hard to maintain | Single source of truth in `uiIntent.ts` |

### Floating UI Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|--------------|----------------|------------------|
| Hardcoded dimensions in components | Breaks with content changes | FloatingMenu measures dynamically |
| Flip logic in components | Duplicate positioning code | FloatingMenu handles flip |
| Viewport clamping in components | Each component reimplements | FloatingMenu applies policy |
| Layout policy in components | Violates separation of concerns | Components provide anchors only |

### Transaction Ownership Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|--------------|----------------|------------------|
| `tr.setNodeMarkup` in UI package | Violates boundary, risks data loss | Editor package commands only |
| ProseMirror imports in domain/state | Couples business logic to editor | Keep domain pure |
| Direct transaction manipulation | Bypasses invariant enforcement | Use `updateBlockAttrs()` |

---

## When a Solution Conflicts with These Rules

If you identify a conflict:

1. **Stop and call it out**: "This approach would violate [rule name]"
2. **Explain why**: Briefly state which constraint is broken
3. **Propose an alternative**: Suggest a compliant solution
4. **Verify compliance**: Check the alternative against all rules

### Example
```
❌ "We could nest blocks under headings to group them"
→ Violates Rule 1 (flat document model)

✅ Alternative: "Keep blocks flat. When folding, traverse forward
   and hide blocks with indent > heading.indent until you reach
   a block with indent <= heading.indent"
```

---

## Common Scenarios

### Scenario 1: Adding a New Block Type

```typescript
// 1. Define node in schema (extensions/nodes/MyBlock.ts)
export const MyBlock = Node.create({
  name: 'myBlock',
  group: 'block',
  content: 'inline*',
  
  addAttributes() {
    return {
      blockId: { default: null },  // ✅ Required
      indent: { default: 0 },      // ✅ Required
      collapsed: { default: false }, // ✅ For folding
      myCustomAttr: { default: 'value' },
    };
  },
});

// 2. Create component (components/MyBlock.tsx)
export const MyBlock = () => {
  return (
    <NodeViewWrapper
      data-block-id={node.attrs.blockId}  // ✅ For chrome hover
      // ❌ NO hover handlers
    >
      <NodeViewContent />
    </NodeViewWrapper>
  );
};

// 3. Create blocks using centralized function
const newBlock = createBlockNode(schema, {
  type: 'myBlock',
  indent: currentIndent,
  myCustomAttr: 'value',
});
```

### Scenario 2: Enter Key Creates Sibling

```typescript
// ✅ CORRECT
import { createBlockNode } from '../domain/createBlock';

function handleEnterImpl(editor: Editor): boolean {
  const { state, view } = editor;
  const { $from } = state.selection;
  
  // Find current block
  const currentBlock = $from.node($from.depth);
  
  // Create new paragraph with same indent
  const newParagraph = createBlockNode(state.schema, {
    type: 'paragraph',
    indent: currentBlock.attrs.indent,
  });
  
  // Insert after current block
  const insertPos = $from.after($from.depth);
  view.dispatch(state.tr.insert(insertPos, newParagraph));
  
  return true; // ✅ Transaction dispatched
}

export const handleEnter = withUISafety(handleEnterImpl, 'handleEnter');
```

### Scenario 3: Tab Key Indents Block

```typescript
// ✅ CORRECT
import { updateBlockAttrs } from '../domain/updateBlockAttrs';

function handleTabImpl(editor: Editor): boolean {
  const { state, view } = editor;
  const { $from } = state.selection;
  
  const blockPos = $from.before($from.depth);
  const currentBlock = $from.node($from.depth);
  const newIndent = Math.min(currentBlock.attrs.indent + 1, MAX_INDENT);
  
  // Update existing block's indent
  const tr = state.tr;
  updateBlockAttrs(tr, blockPos, { indent: newIndent });
  view.dispatch(tr);
  
  return true;
}

export const handleTab = withUISafety(handleTabImpl, 'handleTab');
```

### Scenario 4: Converting Block Type (Slash Command)

```typescript
// ✅ CORRECT: Create new block, replace old one
function convertToHeading(editor: Editor, level: number): boolean {
  const { state, view } = editor;
  const { $from } = state.selection;
  
  const currentBlock = $from.node($from.depth);
  const blockStart = $from.before($from.depth);
  const blockEnd = $from.after($from.depth);
  
  // Create replacement with same content and indent
  const replacement = createBlockNode(state.schema, {
    type: 'heading',
    headingLevel: level,
    indent: currentBlock.attrs.indent,  // ✅ Preserve indent
    content: currentBlock.content,      // ✅ Preserve content
  });
  
  // Replace old block with new one
  view.dispatch(
    state.tr.replaceWith(blockStart, blockEnd, replacement)
  );
  
  return true;
}
```

### Scenario 5: Adding Chrome Hover to New Block

```typescript
// In your new block component
export const MyNewBlock = () => {
  return (
    <NodeViewWrapper
      data-block-id={node.attrs.blockId}  // ✅ ONLY THIS
      // ❌ NO onPointerEnter
      // ❌ NO onPointerLeave
      // ❌ NO hover state
      // ❌ NO chromeHoverManager imports
      style={{ position: 'relative' }}
    >
      <NodeViewContent />
    </NodeViewWrapper>
  );
};
```

**That's it!** Chrome automatically works because EditorChromeLayer's container-level `mousemove` detects `data-block-id`.

### Scenario 6: Adding a New Floating Menu

```typescript
// Component provides anchor only
function MyFloatingMenu({ editor }: { editor: Editor }) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Calculate where we WANT the menu (anchor)
  const rect = editor.view.coordsAtPos(editor.state.selection.from);
  
  return (
    <FloatingMenu
      isOpen={isOpen}
      position={{
        top: rect.top,     // ✅ Anchor point
        left: rect.left,   // ✅ Anchor point
      }}
      lockScroll={true}
      dismissOnEscape={true}
      onInteractOutside={() => setIsOpen(false)}
    >
      {/* Menu content */}
    </FloatingMenu>
  );
}
```

**FloatingMenu handles:**
- Measuring actual width/height
- Flipping above/below if needed
- Clamping to viewport
- Portal rendering
- Scroll locking

### Scenario 7: Adding a New Keyboard Shortcut with UI

```typescript
// 1. Register UI component in uiIntent.ts
export type UIIntentType = 'slashCommands' | 'atMention' | 'myPicker';

const UI_HANDLERS: readonly UIHandlerConfig[] = [
  {
    name: 'myPicker',
    isActive: (editor) => editor.storage.myPicker?.isOpen ?? false,
    priority: 10000,
  },
];

// 2. Write handler in keymaps/myKey.ts
function handleMyKeyImpl(editor: Editor): boolean {
  // Your logic
  return true;
}

export const handleMyKey = withUISafety(handleMyKeyImpl, 'handleMyKey');

// 3. Register in KeyboardShortcuts.ts
addKeyboardShortcuts() {
  return {
    'Ctrl-Space': ({ editor }) => handleMyKey(editor),
  };
}
```

**Done!** The handler automatically defers to `myPicker` when it's open.

### Scenario 8: Implementing Block Folding

- Keep document flat (never restructure)
- Traverse flat list forward from heading
- Collect blocks with `indent > heading.indent`
- Stop when you hit a block with `indent <= heading.indent`
- Toggle visibility via CSS or filters

### Troubleshooting: Chrome Not Appearing

1. Check: Is container `mousemove` listener attached?
2. Check: Does block have `data-block-id` attribute?
3. Check: Is chrome root `pointer-events: none`?
4. Check: Are chrome buttons `pointer-events: auto`?
5. Check: Is chrome positioned as absolutely positioned sibling?

### Troubleshooting: Cursor Behaving Strangely Near Chrome

1. Verify only `.ProseMirror` has `cursor: text`
2. Ensure chrome has `pointer-events: none` on root
3. Check that chrome is NOT inside contenteditable
4. Remove any `preventDefault` in chrome event handlers

---

## Integration with Existing Code

This architecture is already implemented in:

**Core:**
- `packages/editor/core/EditorCore.tsx` - Main editor setup, container ref
- `packages/editor/core/EditorCore.css` - Cursor semantics (`.ProseMirror` only)
- `packages/editor/tokens.ts` - Global spacing and chrome configuration

**Block Creation:**
- `packages/editor/domain/createBlock.ts` - `createBlockNode()`, `createCleanBlockAttrs()`
- `packages/editor/domain/updateBlockAttrs.ts` - `updateBlockAttrs()`
- `packages/editor/domain/indentOperations.ts` - Indent manipulation

**Chrome System:**
- `packages/editor/components/EditorChromeLayer.tsx` - Chrome overlay with container hover
- `packages/editor/EDITOR_CHROME_LAYER.md` - Complete chrome documentation
- `packages/editor/CHROME_FINAL_STATUS.md` - Architecture decisions and fixes

**Block Components (follow these patterns):**
- `packages/editor/components/ParagraphBlock.tsx` - Reference implementation
- `packages/editor/components/Heading.tsx`
- `packages/editor/components/ListBlock.tsx`
- `packages/editor/components/CodeBlock.tsx`
- `packages/editor/components/Callout.tsx`
- `packages/editor/components/Blockquote.tsx`

**Keyboard Handlers:**
- `packages/editor/plugins/keyboard/uiIntent.ts` - UI component registry
- `packages/editor/plugins/keyboard/withUISafety.ts` - Handler wrapper
- `packages/editor/plugins/keyboard/keymaps/` - All keyboard handlers
- `packages/editor/plugins/keyboard/ARCHITECTURE.md` - Contract documentation

**Floating UI:**
- `packages/ui/src/components/ui-primitives/FloatingMenu.tsx` - Layout policy
- `packages/ui/src/components/ui-primitives/FloatingContainer.tsx` - Portal + positioning
- `FLOATING_UI_ARCHITECTURE.md` - Complete floating UI documentation

When making changes, reference these files for patterns that comply with the architecture.
