# Clutter 2.0 — Editor

Personal note-taking app with a custom pure functional block editor. Single Vite + React app — no monorepo packages.

## Project Structure

```
apps/editor/
  src/
    engine/           Pure functional editor engine (no DOM, no React)
      engine.ts       EditorState, Node, PrimitiveOp types, applyOp()
      commands.ts     High-level commands → PrimitiveOp[] (splitNode, mergeNode, indent, outdent, toggleMark)
      history.ts      Undo/redo via inverseOp(); past[]/future[] stacks
    editor/           React wiring — connects engine to DOM
      Editor.tsx      Mouse/keyboard event handling, beforeinput, drag selection
      editor-controller.ts  Orchestrates state + history + dispatch + root invariant
      renderer.ts     Full DOM re-render from EditorState (no diffing, keyed by data-node-id)
      keymap.ts       Keyboard handlers; sequential ID generation (n0, n1, n2…)
      selection.ts    Selection types; read from DOM; sync DOM ↔ state
      input-lock.ts   Global flag: prevents selection restore during browser input events
    design-system/
      tokens.css      Raw design tokens (colors, spacing, typography, radius)
      theme.css       Semantic token mapping (semantic variables)
      icons/          Icon system: svg/ assets, CustomIcons (SVGR), index.ts barrel
      tokens.ts       Layout tokens (indent width, density)
      useTheme.ts     Theme preference hook (light/dark/system)
    styles/
      base.css        Global resets, body, typography, ::selection
      layout.css      App shell layout (sidebar, topbar, content container)
      editor.css      Node chrome (bullet, chevron, connector line, block-select highlight)
    components/
      AppShell.tsx    App layout wrapper (sidebar, topbar, content area)
    App.tsx           Root component
    main.tsx          Vite entry point
  e2e/
    editor.spec.ts    22 Playwright end-to-end tests
  src/engine/*.test.ts  Unit tests: 44 engine + 40 commands + 21 controller = 105 unit tests
```

## Editor Pipeline

```
KeyboardEvent / MouseEvent
  → Editor.tsx (event handlers)
  → commands.ts (produce PrimitiveOp[])
  → EditorController.dispatch()
  → applyOp() × N → new EditorState
  → root invariant (always trailing empty paragraph)
  → renderEditor() (full DOM re-render)
  → syncDomSelectionToState()
```

## Key Concepts

**EditorState**
```typescript
{ nodes: Record<string, Node>, rootId: string, selection: Selection | null }
```

**Node**
```typescript
{ id, parentId, blockType, inlines: Inline[], children: string[], collapsed }
```

**Selection** — three types:
- `collapsed` — caret: `{ nodeId, inlineIndex, offset }`
- `range` — inline text selection within a single node
- `block-range` — multi-node selection: `{ startNodeId, endNodeId }`

**PrimitiveOps** (13 total): `InsertNode`, `DeleteNode`, `MoveNode`, `SetBlockType`, `ToggleCollapse`, `InsertText`, `DeleteText`, `InsertInline`, `RemoveInline`, `AddMark`, `RemoveMark`, `NormalizeInline`

**Root Invariant**: The root always has a trailing empty paragraph. Enforced after every dispatch/undo/redo.

**Undo/Redo**: Each op has an explicit inverse in `history.ts`. `NormalizeInline` has no inverse (null) — commands avoid it where possible.

## Running

```bash
npm run dev          # dev server (port 5174)
npm test             # unit tests (Vitest, watch mode)
npm run test:run     # unit tests (single run)
npm run test:e2e     # Playwright e2e tests
```

## Design System

Dark-first. Components use only semantic tokens (`--color-bg-primary`, `--color-text-secondary`, etc.) — never raw neutral values directly. Light mode overrides semantic tokens via `[data-theme="light"]`.

Font: Inter 16px / 24px line-height. Max content width: 720px.
