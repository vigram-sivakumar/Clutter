# Node Anatomy & Layout Grid

**Status**: LOCKED  
**Depends on**: File 03 (Keyboard), File 04 (Variants)  
**Scope**: UI structure only (no behavior, no styling choices)

---

## 1. Purpose of This File

File 05 defines what a node physically is in the UI.

Not:

- what it does (File 03)
- what it means (File 04)
- how it looks (design system later)

But:

- what DOM structure exists
- which parts are invariant
- where variants are allowed to differ
- what every future component must respect

**If something violates File 05, it is incorrect by definition.**

---

## 2. The Prime Rule (Non-Negotiable)

Every node has the same DOM anatomy.  
Variants are expressed only via CSS classes.

No variant introduces:

- extra wrappers
- different nesting
- different editable regions

This is how Workflowy and Tana scale without collapsing under complexity.

---

## 3. Canonical Node Skeleton (Locked)

```html
<div class="node node--{variant}">
  <div class="node__indent"></div>

  <div class="node__row">
    <div class="node__marker"></div>

    <div class="node__content" contenteditable>
      <!-- plain text only -->
    </div>
  </div>
</div>
```

This structure is **identical** for:

- paragraph
- bullet
- task
- numbered
- heading-1 / heading-2
- callout
- future variants

---

## 4. Slot Responsibilities (Strict)

### 4.1 `node__indent`

- Represents hierarchy depth
- Width = `depth × indentUnit`
- Never interactive
- Never editable
- Never conditional

**Tabs modify data, not this element directly.**

---

### 4.2 `node__row`

- Horizontal layout container
- Aligns marker + content
- Handles vertical rhythm
- Never variant-specific

---

### 4.3 `node__marker`

- Visual affordance only
- Examples:
  - bullet dot
  - checkbox
  - number
  - heading glyph
- Never contains text
- Never receives focus
- Never participates in selection

**Markers are not semantic data — they are render artifacts of `node.props.variant`.**

---

### 4.4 `node__content`

- The only editable surface
- Plain text only
- No inline HTML
- No nested elements
- Cursor, selection, IME all live here

**All grammar (`/`, `@`, `#`) operates exclusively inside this element.**

---

## 5. Variant → Class Mapping (Reference)

| Variant   | CSS Class          |
| --------- | ------------------ |
| paragraph | `.node--paragraph` |
| bullet    | `.node--bullet`    |
| task      | `.node--task`      |
| numbered  | `.node--numbered`  |
| heading-1 | `.node--h1`        |
| heading-2 | `.node--h2`        |
| callout   | `.node--callout`   |

⚠️ **These classes affect only CSS, never logic.**

---

## 6. Selection & Cursor Invariants

- Cursor never enters `node__marker`
- Selection range is always within `node__content`
- Multi-node selection highlights entire `.node`
- Visual selection ≠ DOM selection (decoupled)

---

## 7. Why This Structure Is Final

This anatomy guarantees:

- ✅ Variant explosion is cheap (CSS-only)
- ✅ Keyboard logic stays simple
- ✅ No DOM rewrites on variant change
- ✅ Accessibility remains tractable
- ✅ Drag/drop & virtualization stay sane

Changing this later would require rewriting:

- selection logic
- grammar detection
- cursor math
- hit testing
- drag/drop
- animations

**That's why it gets locked now.**

---

## 8. Explicit Non-Goals (Out of Scope)

File 05 does not define:

- colors
- spacing values
- typography
- icons
- animations
- themes

Those belong to the Design System phase, not the logic/spec layer.

---

## 9. Future Extension Points (Not Breaking Changes)

The following can be added without violating this spec:

- `node__toggle` (collapse/expand control)
- `node__metadata` (properties, tags display)
- `node__actions` (hover menu)

As long as they:

- Are siblings or children of existing slots
- Don't alter the core 4-slot structure
- Don't make `node__content` non-editable

---

## 10. Implementation Notes

**Current codebase (`NodeView.tsx`):**

- Uses different DOM structure
- Renders variant-specific elements conditionally
- Selection logic coupled to DOM structure

**Migration required:**

1. Restructure node rendering to match canonical skeleton
2. Move variant logic to CSS classes only
3. Update selection/cursor code to target `node__content`
4. Ensure indent is visual only (depth-based, not nested)

---

## 🔒 Canonical Statement (Lock)

Any UI implementation that does not conform to this node anatomy  
is considered **invalid**, regardless of appearance.

---

**Next**: File 06 — Design Tokens & Scales (spacing, typography, color)
