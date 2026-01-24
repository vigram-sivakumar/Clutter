# EditorChromeLayer Documentation

## Overview

`EditorChromeLayer` is a React component that implements a single-overlay chrome system for the block editor, following the Notion/Craft design pattern. It provides hover-activated controls (insert, drag handle, options menu) that appear next to blocks without interfering with the editing experience.

**Key Features:**
- ✅ Flicker-free hover detection
- ✅ DOM isolation from editor content
- ✅ Craft-style hover zones for seamless UX
- ✅ Centralized configuration
- ✅ GPU-accelerated animations
- ✅ Type-safe with full TypeScript support

---

## Architecture

### 1. Anti-Flicker Architecture

The chrome system uses four key techniques to prevent flickering:

#### **Atomic State Updates**
```typescript
interface ChromeState {
  blockId: string | null;
  x: number;
  y: number;
  width: number;
  visible: boolean;
}
```
All chrome positioning and visibility is managed in a **single state object**. This prevents partial updates that could cause flicker (e.g., position changing before visibility).

#### **GPU-Accelerated Positioning**
```typescript
transform: `translate(${chrome.x}px, ${chrome.y}px)`
```
Uses CSS `transform` instead of `top`/`left` for positioning. This leverages GPU acceleration and avoids layout recalculations.

#### **requestAnimationFrame**
```typescript
rafHandleRef.current = requestAnimationFrame(() => {
  const rect = blockElement.getBoundingClientRect();
  setChrome({ blockId, x, y, width, visible: true });
});
```
All position updates are batched with the browser's next paint cycle, ensuring smooth 60fps animations.

#### **Centralized Configuration**
```typescript
const CHROME_CONFIG = {
  HIDE_DELAY: 150,
  TYPING_TIMEOUT: 1000,
  TRANSITION_DURATION: 120,
  // ... all timing and layout values
} as const;
```
Single source of truth for all chrome behavior. Edit timing, sizing, and layout in one place.

---

### 2. DOM Isolation

**Critical Principle:** Chrome must never inherit text editing semantics.

#### The Problem
If chrome is rendered inside a `cursor: text` or `contenteditable` container, browsers apply text editing behaviors to chrome buttons:
- Clicking padding shows text cursor
- Gaps in chrome trigger text selection
- Requires hacky `preventDefault()` everywhere

#### The Solution
```
EditorRoot
├─ EditorContent (cursor: text, contenteditable)
└─ EditorChromeLayer (cursor: default, NOT contenteditable)
```

Chrome is mounted as a **sibling** to the editor content, not a child. It lives in a parallel overlay layer with:
- `pointerEvents: 'none'` on the root (ghost layer)
- `pointerEvents: 'auto'` on buttons only (selective interaction)
- No `contentEditable`, `preventDefault`, or `userSelect` hacks needed

**Result:** Browser never confuses chrome with text editing context.

---

### 3. Craft-Style Hover Zones

Each block has invisible `data-hover-only="true"` divs that extend its hover area into the gutters:

```tsx
// In ParagraphBlock.tsx (and all block components)
<NodeViewWrapper>
  {/* Left hover zone - 64px wide */}
  <div
    data-hover-only="true"
    style={{
      position: 'absolute',
      top: 0,
      left: -spacing.hoverZoneLeft,  // -64px
      width: spacing.hoverZoneLeft,
      height: '100%',
      pointerEvents: 'auto',
    }}
  />
  
  {/* Right hover zone - 40px wide */}
  <div
    data-hover-only="true"
    style={{
      position: 'absolute',
      top: 0,
      right: -spacing.hoverZoneRight,  // -40px
      width: spacing.hoverZoneRight,
      height: '100%',
      pointerEvents: 'auto',
    }}
  />
  
  {/* Block content */}
</NodeViewWrapper>
```

**Why This Works:**
1. User hovers block → chrome appears
2. User moves mouse into gutter → still hovering the hover-only div → chrome stays
3. User reaches chrome buttons → `isOverChromeRef` prevents hide → chrome stays
4. **No gaps, no flicker, seamless experience**

**Global Configuration:**
```typescript
// tokens.ts
export const spacing = {
  hoverZoneLeft: 64,   // Left gutter width
  hoverZoneRight: 40,  // Right gutter width
} as const;
```
Edit in one place, updates all blocks and chrome positioning.

---

## Configuration

### CHROME_CONFIG

All chrome behavior is configured in a single constant:

```typescript
const CHROME_CONFIG = {
  // ─────────────────────────────────────────────────────────────
  // Timing
  // ─────────────────────────────────────────────────────────────
  
  /** Grace period to move from block to chrome (ms) */
  HIDE_DELAY: 150,
  
  /** Hide chrome for this long after typing (ms) */
  TYPING_TIMEOUT: 1000,
  
  /** Opacity fade duration (ms) */
  TRANSITION_DURATION: 120,
  
  // ─────────────────────────────────────────────────────────────
  // Layout
  // ─────────────────────────────────────────────────────────────
  
  /** Left gutter width - matches hover zone */
  GUTTER_LEFT: spacing.hoverZoneLeft,   // 64px
  
  /** Right gutter width - matches hover zone */
  GUTTER_RIGHT: spacing.hoverZoneRight, // 40px
  
  /** Gap between chrome buttons */
  GAP: 4,
  
  // ─────────────────────────────────────────────────────────────
  // Button Sizes
  // ─────────────────────────────────────────────────────────────
  
  /** Standard button size (square) */
  BUTTON_SIZE: 24,
  
  /** Drag handler width (narrower than buttons) */
  HANDLER_WIDTH: 20,
  
  /** Icon size inside buttons */
  ICON_SIZE: 16,
  
  /** Button corner radius */
  BORDER_RADIUS: 4,
  
  // ─────────────────────────────────────────────────────────────
  // Z-Index
  // ─────────────────────────────────────────────────────────────
  
  /** Chrome layer z-index (above editor, below modals) */
  Z_INDEX: 10,
} as const;
```

---

## State Management

### ChromeState
```typescript
interface ChromeState {
  blockId: string | null;  // Currently hovered block ID
  x: number;                // X position (relative to container)
  y: number;                // Y position (relative to container)
  width: number;            // Block width (for right chrome positioning)
  visible: boolean;         // Should chrome be visible?
}
```

### Visibility Logic
```typescript
const shouldShow = chrome.visible && !isTyping;
```

Chrome is hidden when:
1. No block is hovered (`chrome.visible === false`)
2. User is typing (`isTyping === true`)

### Refs

```typescript
const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
const rafHandleRef = useRef<number | null>(null);
const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
const isOverChromeRef = useRef(false);
const anchorBlockPosRef = useRef<number | null>(null);
```

**Why Refs?**
- **Timeouts/RAF:** Canceled on cleanup, prevent memory leaks
- **isOverChromeRef:** Synchronous check in event handlers (state would be stale)
- **anchorBlockPosRef:** Tracks shift+click range selection anchor

---

## Event Handlers

### Hover Detection

#### `handleMouseMove(e: MouseEvent)`

Called on every mouse movement over the editor container.

**Flow:**
1. Cancel pending RAF and hide timeout
2. Find block under cursor using `document.elementFromPoint`
3. Get `data-block-id` from closest block element
4. If no block found → schedule hide
5. If block found → schedule RAF to update chrome position

**Why RAF?**
Batches all position calculations with the browser's next paint for 60fps performance.

```typescript
rafHandleRef.current = requestAnimationFrame(() => {
  const rect = blockElement.getBoundingClientRect();
  const containerRect = containerRef.current?.getBoundingClientRect();
  
  // Skip update if still hovering the same visible block (performance optimization)
  setChrome(prev => {
    if (prev.blockId === blockId && prev.visible) return prev;
    
    return {
      blockId,
      x: rect.left - containerRect.left,
      y: rect.top - containerRect.top,
      width: rect.width,
      visible: true,
    };
  });
});
```

**Optimization:** If the blockId hasn't changed and chrome is already visible, we skip the state update. This prevents unnecessary re-renders when continuously hovering over the same block.

#### `handleMouseLeave()`

Called when mouse leaves the editor container.

**Flow:**
1. Cancel pending RAF
2. Schedule hide with `HIDE_DELAY`

### Chrome Container Handlers

```typescript
const chromeContainerHandlers = {
  onMouseEnter: () => {
    isOverChromeRef.current = true;
    clearTimeout(hideTimeoutRef.current);
  },
  onMouseLeave: () => {
    isOverChromeRef.current = false;
    scheduleHide();
  },
};
```

**Why These Are Critical:**

When the user hovers chrome buttons, `document.elementFromPoint` in `handleMouseMove` returns the chrome button element, not the block. Without these handlers, chrome would immediately hide.

The `isOverChromeRef` flag tells `scheduleHide` to skip hiding when the user is interacting with chrome.

### Typing Detection

```typescript
useEffect(() => {
  const handleUpdate = () => {
    setIsTyping(true);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, CHROME_CONFIG.TYPING_TIMEOUT);
  };
  
  editor.on('update', handleUpdate);
  return () => editor.off('update', handleUpdate);
}, [editor]);
```

Hides chrome for 1 second after any editor update to prevent distraction while typing.

---

## Actions

### Insert Block Below

```typescript
const handleInsertBelow = useCallback((e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();

  // 1. Find block position
  state.doc.descendants((node, pos) => {
    if (node.attrs.blockId === chrome.blockId) {
      blockPos = pos;
      blockNode = node;
    }
  });

  // 2. Insert new paragraph after block
  const insertPos = blockPos + blockNode.nodeSize;
  const newParagraph = state.schema.nodes.paragraph?.create();
  view.dispatch(state.tr.insert(insertPos, newParagraph));

  // 3. Move cursor to new block
  const cursorPos = insertPos + 1;
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, cursorPos)));
}, [chrome.blockId, editor]);
```

### Block Selection

```typescript
const handleBlockSelect = useCallback((e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();

  // 1. Find block position
  state.doc.descendants((node, pos) => {
    if (node.attrs.blockId === chrome.blockId) {
      blockPos = pos + 1;  // +1 to select inside block
    }
  });

  if (e.shiftKey && anchorBlockPosRef.current !== null) {
    // 2a. Range selection (Shift+Click)
    const from = Math.min(anchorBlockPosRef.current, blockPos);
    const to = Math.max(anchorBlockPosRef.current, blockPos);
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
  } else {
    // 2b. Single block selection
    anchorBlockPosRef.current = blockPos;
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, blockPos)));
  }

  view.focus();
}, [chrome.blockId, editor]);
```

**Supports:**
- **Click:** Select single block
- **Shift+Click:** Select range from anchor to clicked block

### Block Options Menu

```typescript
const handleOpenMenu = useCallback((e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  console.log('Open menu for block:', chrome.blockId);
  // TODO: Implement block options menu
}, [chrome.blockId]);
```

Currently a placeholder. Will open a context menu with block actions (delete, duplicate, convert, etc.).

---

## Styling

### Theme Integration

```typescript
const { colors } = useEditorTheme();

const baseButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  borderRadius: CHROME_CONFIG.BORDER_RADIUS,
  color: colors.text.secondary,  // Theme-aware
  transition: `background-color ${CHROME_CONFIG.TRANSITION_DURATION}ms ease`,
};
```

### Hover Effects

```typescript
const buttonHoverHandlers = {
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = colors.background.hover;
  },
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = 'transparent';
  },
};
```

Buttons have subtle hover effect using theme colors.

### Positioning

#### Left Chrome
```typescript
transform: `translate(${chrome.x - CHROME_CONFIG.GUTTER_LEFT}px, ${chrome.y}px)`
```
Positioned in the **left gutter**, offset by the gutter width.

#### Right Chrome
```typescript
transform: `translate(${chrome.x + chrome.width}px, ${chrome.y}px)`
```
Positioned at the **right edge of the block**.

### Visibility
```typescript
opacity: shouldShow ? 1 : 0,
pointerEvents: shouldShow ? 'auto' : 'none',
transition: `opacity ${CHROME_CONFIG.TRANSITION_DURATION}ms ease`,
```

- Smooth fade in/out with CSS transition
- `pointerEvents: 'none'` when hidden prevents ghost clicks

---

## Integration Guide

### 1. Mount Chrome Layer

```tsx
// EditorCore.tsx
import { EditorChromeLayer } from '../components/chrome/EditorChromeLayer';

function EditorCore() {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  
  return (
    <div ref={editorContainerRef} style={{ position: 'relative' }}>
      {/* Editor content */}
      <div style={{ cursor: 'text' }}>
        <EditorContent editor={editor} />
      </div>
      
      {/* Chrome overlay - OUTSIDE cursor:text context */}
      <EditorChromeLayer 
        editor={editor} 
        containerRef={editorContainerRef} 
      />
    </div>
  );
}
```

**Critical:**
- Chrome must be a **sibling** to `EditorContent`, not a child
- Parent must have `position: relative`
- Apply `cursor: text` only to the editor content container

### 2. Add Hover Zones to Block Components

```tsx
// ParagraphBlock.tsx (repeat for all block components)
import { spacing } from '../tokens';

export const ParagraphBlock = () => {
  return (
    <NodeViewWrapper
      data-block-id={node.attrs.blockId}
      style={{ position: 'relative' }}
    >
      {/* Left hover zone */}
      <div
        data-hover-only="true"
        style={{
          position: 'absolute',
          top: 0,
          left: -spacing.hoverZoneLeft,
          width: spacing.hoverZoneLeft,
          height: '100%',
          pointerEvents: 'auto',
        }}
      />
      
      {/* Right hover zone */}
      <div
        data-hover-only="true"
        style={{
          position: 'absolute',
          top: 0,
          right: -spacing.hoverZoneRight,
          width: spacing.hoverZoneRight,
          height: '100%',
          pointerEvents: 'auto',
        }}
      />
      
      {/* Block content */}
      <NodeViewContent />
    </NodeViewWrapper>
  );
};
```

**Required for:**
- `ParagraphBlock`
- `Heading`
- `Blockquote`
- `CodeBlock`
- `ListBlock`
- `Callout`
- `HorizontalRule`
- Any custom block types

### 3. Configure Global Tokens

```typescript
// tokens.ts
export const spacing = {
  // Chrome hover zones
  hoverZoneLeft: 64,   // Left gutter width
  hoverZoneRight: 40,  // Right gutter width
} as const;
```

**This controls:**
- Width of hover-only divs in blocks
- Chrome positioning offset
- Single source of truth for gutter dimensions

### 4. Apply Text Cursor Only to ProseMirror

```css
/* EditorCore.css */
.ProseMirror {
  cursor: text;  /* ONLY here - not on parent containers */
  outline: none;
  /* ... other styles */
}
```

**Do NOT apply `cursor: text` to:**
- Editor root container
- Wrapper divs
- Anything outside `.ProseMirror`

---

## Troubleshooting

### Chrome flickers when moving mouse

**Cause:** Multiple state updates in rapid succession.

**Fix:** Already implemented with atomic state and RAF. If still occurring, check:
1. No duplicate event listeners
2. RAF is being canceled properly on cleanup
3. `HIDE_DELAY` is not too short (should be 100-200ms)

---

### Chrome doesn't appear when hovering gutters

**Cause:** Missing hover-only divs in block components.

**Fix:** Add `data-hover-only="true"` divs to all block components (see Integration Guide #2).

---

### Text cursor appears on chrome buttons

**Cause:** Chrome is inside a `cursor: text` container.

**Fix:**
1. Move `EditorChromeLayer` outside the cursor:text container
2. Apply `cursor: text` only to `.ProseMirror` in CSS
3. Remove `cursor: text` from all parent containers

---

### Selection appears when clicking chrome gaps

**Cause:** Chrome inherits contenteditable semantics.

**Fix:** Same as above - DOM isolation is critical.

---

### Chrome hides immediately when moving to buttons

**Cause:** `isOverChromeRef` not working or `chromeContainerHandlers` not attached.

**Fix:**
1. Verify `chromeContainerHandlers` spread is on both chrome containers
2. Check `isOverChromeRef.current` is being set to `true` on mouse enter
3. Increase `HIDE_DELAY` if user's mouse movement is slow

---

### Chrome appears during typing

**Cause:** Typing detection not working.

**Fix:**
1. Verify editor `update` event listener is attached
2. Check `TYPING_TIMEOUT` is appropriate (1000ms default)
3. Ensure `shouldShow` calculation includes `!isTyping`

---

### Chrome position is incorrect after scroll

**Cause:** Chrome positions are not updated on scroll.

**Currently:** This is expected behavior - chrome recalculates on next mousemove.

**Future Enhancement:** Add scroll event listener to update chrome position in real-time.

---

## Performance Characteristics

- **Hover detection:** O(1) - uses `document.elementFromPoint` (DOM API)
- **Block lookup:** O(n) - traverses document to find block position
- **RAF batching:** 60fps - all updates synced with browser paint
- **Memory:** Minimal - only active block tracked, no history/cache

**Optimizations:**
- Atomic state prevents unnecessary re-renders
- Skip state updates when hovering same block (no re-render spam)
- GPU-accelerated transforms (no layout recalculation)
- RAF batching prevents layout thrashing
- Timeouts canceled on cleanup (no memory leaks)

---

## Future Enhancements

### Drag & Drop
Currently the drag handle selects the block. Future implementation:
1. `onMouseDown` on drag handle → start drag
2. `onMouseMove` → show drag preview
3. `onMouseUp` → execute block move
4. Use ProseMirror's `replaceWith` to move nodes

### Block Options Menu
Replace `console.log` with actual menu:
1. Render floating menu on click
2. Actions: Delete, Duplicate, Convert, Turn into...
3. Position menu relative to button
4. Close on click outside or ESC

### Keyboard Navigation
Add keyboard shortcuts:
1. `Cmd+Shift+D` → Duplicate block
2. `Cmd+Shift+Backspace` → Delete block
3. `Cmd+Option+Up/Down` → Move block

### Touch Support
Adapt for mobile/tablet:
1. Long-press to show chrome
2. Tap outside to hide
3. Drag handle becomes touch-friendly

---

## Testing Checklist

### Basic Functionality
- [ ] Chrome appears on block hover
- [ ] Chrome follows mouse between blocks
- [ ] Chrome hides on mouseleave after delay
- [ ] Chrome hides immediately when typing
- [ ] Chrome reappears 1s after typing stops

### Hover Zones
- [ ] Chrome appears when hovering left gutter
- [ ] Chrome appears when hovering right gutter
- [ ] No gaps between block and chrome
- [ ] Chrome stays visible when moving to buttons

### Actions
- [ ] Plus button inserts new block below
- [ ] Cursor moves to new block after insert
- [ ] Drag handle selects block on click
- [ ] Shift+click selects range
- [ ] Options button logs block ID

### Edge Cases
- [ ] Works on first block
- [ ] Works on last block
- [ ] Works on empty blocks
- [ ] Works after delete all + type (no crash)
- [ ] Chrome hidden during undo/redo
- [ ] Chrome repositions after window resize

### Theming
- [ ] Buttons use theme colors
- [ ] Hover effect uses theme hover color
- [ ] Icons have correct color
- [ ] Works in both light/dark themes

### Performance
- [ ] No flicker when moving mouse
- [ ] Smooth 60fps animation
- [ ] No lag on long documents (100+ blocks)
- [ ] No memory leaks (check DevTools)

---

## Related Files

- **`EditorCore.tsx`** - Mounts chrome layer and provides containerRef
- **`EditorCore.css`** - Applies cursor:text only to .ProseMirror
- **`tokens.ts`** - Global hover zone dimensions
- **Block components** - All have hover-only divs
  - `ParagraphBlock.tsx`
  - `Heading.tsx`
  - `Blockquote.tsx`
  - `CodeBlock.tsx`
  - `ListBlock.tsx`
  - `Callout.tsx`
  - `HorizontalRule.tsx`

---

## References

- [Notion's block chrome](https://www.notion.so) - Inspiration for single overlay pattern
- [Craft's hover zones](https://www.craft.do) - `data-hover-only` implementation
- [ProseMirror guide](https://prosemirror.net/docs/guide/) - Transaction and selection APIs
- [TipTap docs](https://tiptap.dev) - Editor framework
- [MDN: transform](https://developer.mozilla.org/en-US/docs/Web/CSS/transform) - GPU acceleration
- [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame) - RAF API

---

**Last Updated:** January 2026  
**Version:** 2.0  
**Author:** Clutter Editor Team
