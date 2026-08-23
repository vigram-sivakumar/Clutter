# Legacy Editor Keyboard Behavior Recovery

**Status: evidence-gathering only.** No code was modified to produce this
document. No decision about the CodeMirror editor's ODR is made here. This
is a forensic reconstruction of what `packages-archived/editor` and
`packages-archived/engine` actually did, offered as evidence for later use
when the current markdown editor's keyboard ODR is expanded into a full
state/position matrix.

Source read in full: `packages-archived/editor/{Editor.tsx, editor-controller.ts,
keymap.ts, renderer.ts, selection.ts, input-lock.ts}` and
`packages-archived/engine/{engine.ts, commands.ts, history.ts}`, plus their
`*.test.ts` files (5,025 lines total). Every file was read completely, not
grepped for keyword hits.

## 0. The single most important finding

**The old editor was not a Markdown-text editor. It was a rich outliner
(Notion/Roam/Tana-shaped), not a text buffer with list syntax.**

The old `EditorState` is a tree of `Node` objects (`engine.ts:33-40`):

```ts
type Node = {
  id: string;
  parentId: string | null;
  blockType: BlockType;   // 'root'|'paragraph'|'heading1..3'|'task'|'quote'|'divider'|'table'
  inlines: Inline[];      // one normalized text run per node, in practice
  children: string[];     // child node IDs — THIS is how nesting/"lists" exist
  collapsed: boolean;
};
```

There is **no Markdown source text anywhere**, no list-marker characters
(`-`, `1.`, `[ ]`), no concept of "bullet list" vs "ordered list" vs "task
list" as distinct container types, and **no `checked` field on `Node` at
all** — `task` is a `blockType` value but nothing in the read source ever
sets or reads a completion flag for it. Every "list item" is simply a node
with `children`; nesting depth is graph depth, not column/indentation.
Indent/outdent (`commands.ts:184-234`) are `MoveNode` operations that
reparent a node — there is no whitespace, no marker column, no
CommonMark-style "content column" concept anywhere in this codebase.

**Consequence for this recovery pass:** the caret-position matrix the user
asked for (`BEFORE_MARKER`, `AFTER_MARKER`, crossing a checkbox, mixed
bullet/ordered/task nesting, etc.) has **no source-level counterpart** in
the old code for most of its marker-specific cells, because the old editor
never represented markers as text the caret could sit before/after. What
*does* transfer directly is the **structural decision model**: what counts
as "start of item" vs "inside content" vs "end of item", what Enter/
Backspace/Tab do to parent/child/sibling relationships, and where the caret
lands afterward — all of which is unambiguous, since caret position there
is `(nodeId, inlineIndex, offset)`, not a text-buffer position.

Every section below states explicitly, per the A/B/C rule requested,
whether a claim is directly implemented, inferred from a call chain, or
unknown/inapplicable to this architecture.

---

## 1. Core model, read completely

### 1.1 Blocks/nodes (`engine.ts`)
- `BlockType`: `root | paragraph | heading1|2|3 | task | quote | divider | table`. **[A]**
- A node's `inlines` array is kept normalized to a single `{type:'text', text, marks}` run in every path actually exercised — `normalizeInlines` (engine.ts:150-172) merges adjacent same-mark text runs and guarantees at least one empty text inline exists. Non-text inlines (`tag`, `mention`, `date`, `reference`) exist in the type union but the DOM layer (`renderer.ts:386-424`) explicitly only ever renders `inlines[0]` ("normalized model: single text segment") — multi-inline rendering/editing was not completed. **[A]** for what's implemented; **[C]** for whether multi-inline was ever intended to reach further.
- Nesting = `children: string[]` on every node; a "list" is just a chain of nodes with children. No distinct list-container node exists (no `BulletList`/`OrderedList`/`List` type). **[A]**
- No `checked` field, no task-completion mutation path anywhere in `engine.ts`, `commands.ts`, or the two `*.test.ts` files. **[A]** (absence confirmed, not inferred)

### 1.2 Selection (`selection.ts`)
Three selection shapes, all in terms of node graph position, never raw text-buffer offsets:
- `CollapsedSelection = { nodeId, inlineIndex, offset }` — offset is *inside* one inline's text.
- `RangeSelection = { anchor, focus }`, each an inline point — **same-node only** in every place it's actually handled (see §2).
- `BlockRangeSelection = { startNodeId, endNodeId }` — a selection spanning ≥2 *distinct nodes*, resolved via `getVisibleNodeIds` order, not raw DOM order.

`getSelection()` (selection.ts:110-171) reads the DOM and classifies: same point → `collapsed`; same node, different offset → `range` (normalized so `anchor.offset <= focus.offset`, selection.ts:173-176); **different node → always `block-range`**, never a cross-node inline range. **[A]** — there is no code path anywhere that produces or handles a `range` selection spanning two different node IDs. Cross-node inline selection was explicitly not built.

### 1.3 Keyboard routing (`keymap.ts`, `Editor.tsx`)
Two separate pipelines, not one:
- **`beforeinput`** (`Editor.tsx:166-289`) owns: `insertParagraph` (→ `handleEnter`), `insertText` (character insertion, all 3 selection shapes), and explicitly no-ops `historyUndo`/`historyRedo` (the browser's native undo is suppressed; only the app's own Ctrl+Z is live).
- **`keydown`** (`keymap.ts:39-245`) owns: Ctrl/Cmd+Z (undo/redo), **Tab/Shift-Tab**, Ctrl/Cmd+A, all four **arrow keys**, **Delete**, **Backspace**.
- Enter is *not* handled in `keydown` at all — only via `beforeinput`'s `insertParagraph`. **[A]**
- `isHandlingInput` (`input-lock.ts`) is a single global boolean set around every `beforeinput` handler call, checked before every DOM-selection-only dispatch (arrow moves, selection-only commits) to prevent the app's own selection sync from fighting the browser's in-flight native edit. **[A]** — this is purely an implementation guard, not a behavioral rule; noted because it constrains *which* of the recovered ops can even run concurrently (arrow-key state updates are explicitly skipped while a beforeinput is in flight).

### 1.4 Commands → ops → engine (`commands.ts`, `engine.ts`)
Strict separation: **commands never mutate, never call `applyOp`** — they read `state` and return `PrimitiveOp[]`; `applyOp` is the only mutator; `EditorController.dispatch` is the only caller of `applyOp` in the live app (`editor-controller.ts:115-233`). Four structural commands recovered:
- `splitNodeCommand` — Enter-at-a-point in one node.
- `mergeNodeCommand` — Backspace-at-start-of-node into previous sibling.
- `indentCommand` / `outdentCommand` — Tab / Shift-Tab.

### 1.5 History (`history.ts`)
Standard invertible-op undo/redo: `inverseOp` maps every `PrimitiveOp` to its exact inverse (`InsertNode↔DeleteNode`, `InsertText↔DeleteText` w/ stored `deletedText`, `MoveNode↔MoveNode` w/ swapped from/to, `AddMark↔RemoveMark`, `SetBlockType`/`ToggleCollapse` swap `from`/`to`). `NormalizeInline` has **no inverse** (returns `null`, silently dropped from the inverse chain) — normalization is treated as non-semantic. **[A]**

Undo has one explicit, named product decision (`editor-controller.ts:253` comment): *"Tana-style: never restore a selection highlight on undo — always collapse to a caret."* A restored `block-range` collapses to `{nodeId: startNodeId, offset:0}`; a restored `range` collapses to its anchor point. **[A]**

### 1.6 The "root invariant" (`editor-controller.ts:51-113`)
Runs after **every** `dispatch` with ops (not on selection-only dispatches): if root's last child is missing, or exists but is non-empty, insert a fresh empty trailing paragraph node. This is a standing structural rule that interacts with several of the matrices below (Enter at the very end of the document, Backspace deleting the last content node, etc.) and is **not** part of the undo/redo history itself (invariant ops are pushed *outside* the tracked history entry, `editor-controller.ts:183`, deliberately: "invariant ops are structural maintenance — not part of undo/redo history"). **[A]**

---

## 2. Keyboard operation matrix

Caret positions below use the old architecture's actual vocabulary
(§3), not invented terms. Every "AFTER_MARKER"/"BEFORE_MARKER"-style
position from the user's requested matrix is marked **N/A — no marker
concept in this architecture** where the old code has no text for a caret
to sit before or after.

### Enter (`beforeinput: insertParagraph` → `handleEnter`, `Editor.tsx:63-164`)

| Position | Behavior | Class |
|---|---|---|
| `collapsed`, offset `0` (**CONTENT_START**, first char) | `splitNodeCommand` at `(nodeId, inlineIndex, offset=0)`: current node's inline text is *emptied* (head keeps prefix "" ), new sibling node inserted directly after current, gets the *entire* original text as tail. Caret → new node, offset 0. Net effect: an **empty node is created above** the original content, which moves down one node. | **A** |
| `collapsed`, offset `n` where `0<n<len` (**CONTENT_MIDDLE**) | Split exactly at offset: current node keeps `text[0:n]`; new sibling node gets `text[n:]` as its full inline text; new node inserted as the *immediate next sibling* (same parent, index+1) — **not** as a child. Caret → new node, offset 0. | **A**, directly tested (`editor-controller.test.ts:260-278`, `commands.test.ts:135-146`) |
| `collapsed`, offset `len` (**CONTENT_END**) | Split at end: current node text unchanged; new node gets **empty** text. Caret → new (empty) node, offset 0. | **A**, tested (`commands.test.ts:161-171`) |
| `collapsed` in an **EMPTY_ITEM** (`text === ''`) | Same split algorithm at offset 0: current node stays empty, new *also-empty* sibling is created after it, caret moves to the new one. **There is no "Enter on empty item exits the list" special case anywhere in this code** — every Enter on a collapsed caret runs the identical `splitNodeCommand`/append-sibling path regardless of emptiness, indentation depth, or whether the node has children. | **A** (absence of a special-case confirmed by full read of `handleEnter`) |
| `collapsed`, node **has children** (e.g. `- Parent\|` with a child below it) | `splitNodeCommand` reads only `node.parentId`/its index among **its own parent's** children (`commands.ts:41-52`) — it never inspects `node.children`. The new node is inserted as `node`'s own next sibling at the *same nesting level as `node`*, **not** as `node`'s first child and **not** below `node`'s subtree. Any existing children of `node` stay exactly where they are (still children of the *original* node) — Enter never moves or reparents them. | **A**, directly falls out of `splitNodeCommand`'s index math; not explicitly asserted by a "parent-with-children" test, so flagged **[B]** for the "children stay put" half specifically (no dedicated test exercises Enter on a node that already has children) |
| `range` selection, same node (**partial or full content selection**) | Delete the selected range first (`DeleteText`+`NormalizeInline`), *then* run `splitNodeCommand` against the **post-delete** state at the collapsed (start) offset — explicitly sequenced this way so undo doesn't double-record the deleted text (`Editor.tsx:93-99` comment). Net: selected text is removed, then split happens at that point exactly as the collapsed case above. | **A** |
| `block-range` (selection spans ≥2 nodes) | Enter does **not** delete the selected nodes. It collapses to the **first visible node** in the range (`Math.min(startIdx,endIdx)` by visible order, not selection order) and splits *that node* at the end of its text, creating a new empty node right after it. All originally-selected nodes are left untouched. | **A** (`Editor.tsx:116-146`) — this is a deliberate simplification, explicitly not "delete then insert" |
| `BEFORE_MARKER` / `AFTER_MARKER` distinctions the user asked about | **N/A** — no marker text exists to be before/after. The closest analog, "does Enter behave differently at content offset 0 vs offset 1," collapses to the single CONTENT_START row above: offset 0 and offset 1 run the *identical* algorithm with a different split point, no branch distinguishes them. | **C** — explicitly not established by this codebase |
| Shift+Enter | **No handler exists anywhere** in `keymap.ts`, `Editor.tsx`, or `editor-controller.ts`. `insertLineBreak` (the `beforeinput` type Shift+Enter normally produces) is never checked. Default browser behavior (an in-DOM `<br>` inside a `contenteditable`) would occur, uncaught by the model, and would immediately desync from `EditorState` since nothing captures it. | **C** for intended behavior; **A** that no explicit handling exists |

### Backspace (`keydown: Backspace`, `keymap.ts:150-244`, structural fallthrough `handleBackspace`, `keymap.ts:299-409`)

| Position | Behavior | Class |
|---|---|---|
| `collapsed`, offset `>0` (**CONTENT_MIDDLE/END**, i.e. not at start) | Deletes exactly one character before the caret: `DeleteText(offset-1, length=1)` + `NormalizeInline`. Caret → same node, `offset-1`. Purely local, single-node. | **A** |
| `collapsed`, offset `0` (**CONTENT_START**) **and a previous sibling exists** | Structural merge (`mergeNodeCommand`, `commands.ts:113-179`): current node is deleted; **its children are moved** (via `MoveNode`, leaf-preserving) to become trailing children of the previous sibling, appended *after* that sibling's existing children; current node's inline text is appended to the previous sibling's last inline (merging marks-compatible runs, or inserted as a new inline run if marks differ). Caret → previous sibling, at the **exact offset where its original text ended** (i.e. the old boundary between the two nodes' text, `keymap.ts:393-403`). | **A**, directly tested (`editor-controller.test.ts:297-313`, `commands.test.ts:229-297`) |
| `collapsed`, offset `0`, **node is the very first root child** (`node.parentId === rootId && myIndex === 0`) | Explicit no-op — Backspace does nothing (`keymap.ts:381`: `if (node.parentId === state.rootId && myIndex === 0) return;`). | **A** |
| `collapsed`, offset `0`, node has **no previous sibling but is nested** (first child of a parent node, not root) | `mergeNodeCommand` returns `[]` when `myIndex <= 0` (`commands.ts:118`) regardless of nesting depth — so Backspace at the start of a **first nested child** is also a no-op; it does **not** outdent/promote the item, and does **not** merge into the parent node's own text. This is a deliberate absence: Backspace never implicitly outdents. | **A** (falls directly out of `myIndex <= 0` guard; explicitly distinct from the *current* CodeMirror editor's Backspace-dedents-a-nested-marker behavior — see §5) |
| `range` selection, **same node** | `DeleteText` over `[startOffset,endOffset)` + `NormalizeInline`. Caret → collapsed at `startOffset`. | **A** |
| `range` selection where `anchor.nodeId !== focus.nodeId` | **Explicit no-op** (`keymap.ts:166`: `if (sel.anchor.nodeId !== sel.focus.nodeId) return;`) — but recall from §1.2 that cross-node `range` selections are never actually produced by `getSelection()`, so this guard is dead code / defensive only in practice. | **A** for the guard; **[C]** whether it was ever reachable |
| `block-range` (≥2 whole nodes selected) | Deletes every **top-level root** of the selected span (nodes in the visible range whose parent is *not itself in the deleted set* — computed via `topLevelIds` filter, `keymap.ts:323-327`), each via a **leaf-first recursive subtree delete** (`generateSubtreeDeleteOps`, `keymap.ts:261-282`) so the entire subtree of a selected parent is removed, not just the parent. One exception: the **systemic (trailing empty) node is never deleted** even if selected (`isSystemicNode` check, `keymap.ts:348`). Caret repair afterward goes through `repairSelectionAfterDelete` (§6). | **A**, tested (`editor-controller.test.ts:451-476`) |
| `Delete` key, `collapsed` or `range` (forward delete) | **Explicit stub — not implemented.** `keymap.ts:140-148`: only the `block-range` case is wired (delegates to the same `handleBackspace` block-deletion path); collapsed/range forward-delete is a bare comment "stub, not yet implemented," with `ev.preventDefault()` called but no op dispatched — i.e. Delete silently does nothing at a collapsed caret or inline range in this old editor. | **A** (explicit code comment, not inference) |

### Tab / Shift-Tab (`keydown: Tab`, `keymap.ts:54-99`)

| Case | Behavior | Class |
|---|---|---|
| Tab, `collapsed` selection, node **has a previous sibling** | `indentCommand`: `MoveNode` — node becomes the **last child** of its immediately preceding sibling (`toIndex = prev.children.length`), i.e. appended after that sibling's existing children, never interleaved. The node's **own children move with it implicitly** — `MoveNode` reparents by node ID only; nothing in `indentCommand` touches `node.children`, so the entire subtree travels as a unit automatically (there's no separate "move descendants" step because the tree *is* the parent-pointer graph, not a text range). Following/preceding siblings at the original level are otherwise untouched — Tab only ever moves the *one* selected node (plus its already-attached subtree). | **A**, tested (`commands.test.ts:303-323`) |
| Tab, node is the **first child of its parent** (no previous sibling) | `indentCommand` returns `[]` — Backspace-style no-op; nothing dispatched. | **A** |
| Tab indenting under a **collapsed** previous sibling | Special auto-expand: if the *new* parent (the previous sibling being indented under) is currently `collapsed`, an extra `ToggleCollapse(from:true,to:false)` op is appended so the newly-nested node is immediately visible (`keymap.ts:66-86`). This is the one place old code explicitly reasons about *visual* consequences of a structural move. | **A** |
| Shift-Tab, node **has a parent that isn't root** | `outdentCommand`: `MoveNode` to become the **next sibling immediately after its former parent**, in the former parent's own parent (grandparent). If the grandparent doesn't exist (former parent *is* root's structural equivalent — can't happen since root itself has no parent field usable that way, `commands.ts:222` `toParentId = grandparent ? grandparent.id : parent.id`), falls back to index 0 of the same parent — but in practice this fallback branch requires a parent with `parentId===null` other than root, which the model doesn't otherwise construct. | **A**, tested (`commands.test.ts:351-370`) |
| Shift-Tab, node is **already top-level** (parent is root) | No-op — `outdentCommand` returns `[]` (root has no `parentId`, so `grandparent` lookup fails the `parentIndex >= 0` check). | **A** |
| Tab/Shift-Tab with a **`range` or `block-range` selection** | Explicit early-return: `if (!sel || sel.type !== 'collapsed') return;` (`keymap.ts:58`) — Tab/Shift-Tab are **only** ever applied to a single collapsed caret in this codebase; multi-node/range indent-outdent was never built. (Contrast with the *current* CodeMirror editor, where Tab/Shift-Tab explicitly operate over every selected line — see §5.) | **A** |
| Indent-then-outdent round trip | Confirmed identity (`commands.test.ts:394-408`, `commands.test.ts:491-503`): same parent, same position, same children — no data loss. | **A** |

### Arrow keys (`handleArrowNavigation`, `keymap.ts:451-650`)

The old model's arrow handling is **entirely node-graph-based**, not
visual/line-based — there is no soft-wrap concept, no "visual line" the
model is aware of; "up/down" literally means "previous/next node in
`getVisibleNodeIds` order," full stop, regardless of how the browser would
have visually wrapped the text.

| Key / state | Behavior | Class |
|---|---|---|
| Any arrow, current selection is `block-range` | `ev.preventDefault()` always. Left/Up → collapse to the **first** visible node in the range at offset 0; Right/Down → collapse to the **last** visible node in the range at offset 0. (Not "offset = wherever it would visually be" — always offset 0.) | **A** |
| Any arrow, current selection is `range` (same-node inline range) | `ev.preventDefault()` always. Left/Up → collapse to `anchor` (already the lower offset, since `range` is pre-normalized); Right/Down → collapse to `focus`. Comment explicitly notes this exists to keep internal state in sync with the DOM caret so the *next* keystroke's `beforeinput` doesn't act on a stale range. | **A** |
| `collapsed`, ArrowLeft, `offset > 0` | Move left one char within the same inline: `offset - 1`. | **A** |
| `collapsed`, ArrowLeft, `offset === 0`, `inlineIndex > 0` | Move to the **end** of the previous inline segment (multi-inline case — reachable in principle even though the DOM layer only renders `inlines[0]`; this is model-level logic, decoupled from the render gap noted in §1.1). | **A** at the model level; **[C]** whether ever DOM-reachable given renderer only shows `inlines[0]` |
| `collapsed`, ArrowLeft, `offset === 0`, `inlineIndex === 0` | Jump to **end of previous visible node's text** (`moveCaretToNodeEnd`) — crosses node/"list item" boundaries in a **single keypress**, no intermediate stop at a marker or indent gutter (there is none to stop at). If no previous visible node exists, no-op. | **A** |
| `collapsed`, ArrowRight | Exact mirror of ArrowLeft: within-text → next inline segment → **start of next visible node's text** (`moveCaretToNodeStart`), single keypress across node boundaries. | **A** |
| `collapsed`, ArrowUp | **Always** `moveCaretToNodeStart(previousVisibleNode)` — not "same column, previous line," not preserving horizontal offset at all. Landing offset is unconditionally `0`. If node has no previous visible node, no-op (caret stays put, `ev.preventDefault()` still fires so the browser doesn't move it either). | **A** |
| `collapsed`, ArrowDown | Mirror: always `moveCaretToNodeStart(nextVisibleNode)`, offset always `0`. | **A** |
| Crossing a **collapsed** parent (children hidden) | `getVisibleNodeIds` (`engine.ts:355-375`) skips a node's children entirely when `node.collapsed === true` — so Up/Down/Left/Right at a node boundary transparently skips the entire hidden subtree as if it didn't exist; no special-cased "expand on navigate" behavior. | **A** |
| Home / End | **No handler anywhere.** Neither key is referenced in `keymap.ts`. Falls through to unhandled default (whatever the browser's native `contenteditable` Home/End does, uncaptured by the model — likely desyncing state exactly like unhandled Shift+Enter). | **A** (absence confirmed) |
| Modifier variants (Ctrl+Arrow word-jump, Alt+Arrow, Cmd+Arrow line-jump, Shift+Arrow extend-selection) | **None implemented.** The four bare arrow keys are the *only* arrow-related bindings; no modifier branch exists in `handleArrowNavigation` or the outer `keydown` handler. Shift+Arrow in particular — the natural way to *create* a `range`/`block-range` selection via keyboard — has no dedicated code; only mouse drag (`handleMouseDown`/`handleMouseMove`/`handleMouseUp` in `Editor.tsx`) ever produces those selection types. | **A** |

---

## 3. Caret-position taxonomy (old architecture's actual concepts)

The old code's real vocabulary — not the marker-relative taxonomy the
current markdown editor needs, since there is no marker text:

- **`CONTENT_START`** — `collapsed.offset === 0`, current inline segment (`inlineIndex === 0` in every DOM-reachable case, since only `inlines[0]` renders).
- **`CONTENT_MIDDLE`** — `0 < offset < text.length`.
- **`CONTENT_END`** — `offset === text.length` of the node's rendered inline.
- **`EMPTY_ITEM`** — a node whose sole inline is `{type:'text', text:''}` (checked via `.trim() === ''` in several places, e.g. `isSystemicNode`, root-invariant `isEmpty`) — **not** a distinct caret position type, but a distinct *node* condition several ops branch on (root-invariant, systemic-node exclusion from block-delete).
- **`SYSTEMIC` node** — the single, always-present trailing empty root-level node the invariant maintains; explicitly excluded from block-range delete and explicitly the thing new content gets appended after.
- **Selection shapes** (not caret positions per se, but the top-level dispatch discriminant everywhere): `collapsed` / `range` (same-node only) / `block-range` (≥2 distinct nodes, by visible order).
- There is **no** `BEFORE_MARKER`/`AFTER_MARKER`/`BEFORE_NEXT_BLOCK` concept — **[C]**, not recoverable from this codebase because no marker text exists for the caret to stand next to.

---

## 4. Structural invariants actually supported by the old implementation

Only invariants directly falling out of the traced call chains above,
each tagged with its class:

1. **Enter always splits the current node into two siblings at the same
   level** — it never creates a child, never treats "empty item" or "has
   children" specially. **[A]**
2. **Backspace at content-start merges into the previous sibling and moves
   that sibling's children out from under it into the surviving node,
   appended after the surviving node's own existing children.** **[A]**
3. **Backspace never implicitly outdents** a first-child node — the only
   two Backspace-at-boundary outcomes are "merge into previous sibling" or
   "no-op"; there is no third "promote one level" branch. **[A]** — this is
   a genuine, explicit divergence from what list editors (including the
   *current* Clutter markdown editor, §5) commonly do.
4. **Tab/Shift-Tab move the whole subtree as a single unit**, because
   subtree membership is parent-pointer-based, not text-range-based —
   there is no separate "re-derive descendants" step, structurally
   impossible for a child to be left behind. **[A]**
5. **Indent always lands as the *last* child of the previous sibling**,
   never interleaved among that sibling's existing children, regardless of
   the indenting node's original position among *its own* former siblings.
   **[A]**
6. **Arrow-key vertical navigation is node-granular, not
   line/visual-granular** — Up/Down always land at `offset 0` of the
   adjacent *node*, never attempting to preserve horizontal caret column.
   **[A]**
7. **A trailing empty node is a standing structural invariant**, re-asserted
   after every op-bearing dispatch, and is excluded from block-delete and
   from "is this node systemic" checks used elsewhere. **[A]**
8. **Undo never restores a highlighted selection — always collapses to a
   caret** ("Tana-style", explicitly named in a comment). **[A]**
9. **Forward Delete is unimplemented for anything but whole-node
   (`block-range`) selections.** **[A]**

---

## 5. Mixed-construct matrix

**This section is almost entirely N/A for this old architecture**, and
that itself is the finding worth carrying forward: bullet vs. ordered vs.
task are not distinct container types in `packages-archived`. A "list" is
indistinguishable, at the model level, from any other chain of nested
`paragraph`/`task`/`heading` nodes — indent/outdent, Enter, and Backspace
all operate purely on `parentId`/`children`, with **zero branching on
`blockType`** anywhere in `commands.ts` or `keymap.ts`. Concretely:

- `splitNodeCommand` copies `node.blockType` onto the new node unchanged
  (`commands.ts:69`, confirmed by test at `commands.test.ts:173-182`
  "new node inherits blockType") — so Enter inside a `task` node produces
  another `task` node, Enter inside a `heading1` produces another
  `heading1`, etc. **This is the one blockType-sensitive rule that
  exists**, and it's uniform across all block types, not construct-pair-specific.
- `mergeNodeCommand`/`indentCommand`/`outdentCommand` never read or compare
  `blockType` at all — merging a `task` into a preceding `paragraph`, or
  indenting a `heading1` under a `task`, is not special-cased, refused, or
  even distinguished from the homogeneous case. **[A]** (confirmed absence)
- Because there's no marker text, "crossing a checkbox," "crossing a list
  marker," "mixed bullet/ordered/task nesting" as the user's prompt
  describes them **cannot occur** in this model — a checkbox, if rendered
  at all for `blockType: 'task'`, is not present anywhere in `renderer.ts`
  (no checkbox widget, no `[ ]`/`[x]` text, no `checked` state to render).
  **[A]** (absence confirmed by full read of `renderer.ts`)

**Conclusion for this section: the old implementation provides no direct
evidence for any bullet↔ordered↔task transition behavior**, because that
distinction didn't exist in its data model. Anything here is **[C]** —
must be decided fresh for the CodeMirror ODR, not recovered.

---

## 6. Caret/selection transformation rules (structural ops)

| Operation | Caret destination | Source |
|---|---|---|
| Enter (collapsed) | New node, `inlineIndex:0, offset:0` | `Editor.tsx:157-162` |
| Enter (range, same node) | New node, `inlineIndex:0, offset:0` (after pre-deleting the range) | `Editor.tsx:107-112` |
| Enter (block-range) | New node created after the **first** visible node in the range, `offset:0` | `Editor.tsx:139-144` |
| Backspace merge | Previous sibling, at **its own original end offset** (the old text/new text boundary) | `keymap.ts:398-403` |
| Backspace inline delete | Same node, `offset - 1` | `keymap.ts:230-235` |
| Backspace range delete | Same node, `offset = startOffset` (collapsed to range start) | `keymap.ts:194-199` |
| Backspace/Delete block-range delete | Repaired via `repairSelectionAfterDelete` (below) — **not** hardcoded by the delete handler itself | `engine.ts:444-495` |
| Tab / Shift-Tab | **Selection unchanged** — `controller.dispatch(ops, {...same nodeId/inlineIndex/offset as before...})` (`keymap.ts:90-95`) explicitly re-passes the pre-move selection; the caret stays anchored to the *same node ID*, which now simply lives at a different tree position. | `keymap.ts:90-95` |
| Arrow keys | See §2 arrow table — always deterministic per the node-graph rules, never "wherever the browser would have put it" | `keymap.ts:451-650` |
| Any op producing a `DeleteNode` whose selection referenced the deleted node(s) | `repairSelectionAfterDelete`: locates the lowest deleted **visible index** *before* the delete (for `block-range`, `min(startIdx,endIdx)`; otherwise the lowest `DeleteNode.index` at the root), clamps to the new visible-list length, and collapses to `(survivingNodeId, inlineIndex:0, offset:0)` of whatever now occupies that slot (or the systemic trailing node as a last resort). **Only fires if the pre-delete selection actually referenced a deleted node** — otherwise the original selection is preserved as-is. | `engine.ts:444-495`, `editor-controller.ts:166-171` |
| Undo | Collapses `range`/`block-range` `beforeSelection` down to a caret (start point); a `collapsed` `beforeSelection` is restored as-is | `editor-controller.ts:250-268` |
| Redo | Restores `afterSelection` from the history entry verbatim (no collapsing) | `editor-controller.ts:310-319` |

---

## 7. Comparison against the current editor

**Caveat up front:** there is no written ODR document in this repository —
`docs/`, `git log`, and the working tree were all searched; the only match
for "ODR" is the in-progress commit `45aa9a75 "Freat(keyboard ODR
inprogress"` on this branch, which is itself the *current keymap source*
(`apps/app/src/features/markdown/editor/codemirror/{list,paragraph}/*.ts`,
`markdownTabKeymap.ts`, `deleteMarkupForward.ts`). This comparison is
therefore against **what that code currently does**, read directly
(`listIndentKeymap.ts`, `listDeleteKeymap.ts`, `markdownTabKeymap.ts`,
and the doc-comment header of `deleteMarkupForward.ts`), not against a
separate spec document — flag this to the user before using it as
"the ODR" for anything.

Fundamental framing difference to hold in mind throughout: the current
editor is a **CodeMirork 6 Markdown *text buffer*** — a `ListItem` is a
Lezer syntax-tree node over literal characters (`-`, `1.`, leading spaces),
and indentation is measured in **columns of literal whitespace**
(`contentColumn`, `leadingSpaceCount`). The old editor had **no text
buffer at all** for structure — nesting was a parent pointer, indent was a
`MoveNode`. Every comparison below is therefore a comparison of *decisions*,
not of mechanism.

### (1) Already covered by current implementation, consistent with old behavior
- **Tab/Shift-Tab move the item's entire subtree as one unit**, never
  leaving descendants behind — true in both: old via parent-pointer
  reparenting (§4.4), current via `changesForDelta` applying the same
  column delta to every physical line in the `ListItem`'s node range
  (`listIndentKeymap.ts:153-182`). **Same invariant, different mechanism.**
- **Tab/Shift-Tab always "consumed" once in list context**, even when no
  actual indent/outdent can happen (e.g. already top-level, or no previous
  sibling to nest under) — old: `indentCommand`/`outdentCommand` return
  `[]` but Tab/Shift-Tab keydown still calls `preventDefault()`
  unconditionally; current: `indentListItem`/`dedentListItem` explicitly
  document and return `true` "even when every root turns out unable to
  indent" (`listIndentKeymap.ts:213-219`, `254-256`). **Same contract.**
- **Indent nests under the immediately preceding sibling**, not an
  arbitrary ancestor — old: `prev = parent.children[myIndex-1]`; current:
  `root.prevSibling` must itself be a `ListItem` (`listIndentKeymap.ts:228-231`).
  **Same rule.**

### (2) Missing from current implementation (present in old, not found in current)
- **Old**: Backspace-at-structural-boundary *always* has a defined,
  data-model-level outcome (merge into previous sibling, or no-op) that is
  never "let the browser guess." **Current**: Backspace's own module
  doc-comment (`listDeleteKeymap.ts:13-33`) explicitly *defers* most cases
  to upstream `@codemirror/lang-markdown`'s `deleteMarkupBackward`, only
  intercepting a narrow set of "marker-removal-boundary" and ordered-list-
  renumbering cases — i.e. most Backspace-in-a-list behavior in the current
  editor is **not Clutter's own decision at all**, it's whatever
  `@codemirror/lang-markdown` ships. This is a gap worth flagging
  explicitly: the old editor's Backspace behavior was **100% first-party
  and enumerable**; the current editor's is **majority third-party**,
  which means most of §2's Backspace matrix above has *no current-editor
  analog to compare against inside this repo* — it would have to be
  recovered from `@codemirror/lang-markdown`'s own source, which this
  investigation was not scoped to read (out of bounds: the user asked for
  `packages-archived`, not `node_modules`).
- **Old's explicit "Backspace never implicitly outdents a first child"**
  rule (§4.3) has no confirmed current-editor counterpart either way in
  the code read for this report — `deleteMarkupBackwardSubtreeAware`'s
  "risky && parentItem" branch (`listDeleteKeymap.ts:200-219`) does the
  **opposite**: at a nested item's own marker-boundary it *dedents the
  item's subtree by one level* rather than refusing/no-oping. **This is a
  direct behavioral contradiction — see (3) below.**
- **Multi-node Tab/Shift-Tab (selection spanning multiple list items)**:
  old explicitly refuses this (`sel.type !== 'collapsed'` early-return,
  §2 Tab table) — Tab/Shift-Tab only ever act on a single collapsed caret.
  Current explicitly supports it (`selectedLines`/`resolveRoots` walks
  every line the selection touches, `listIndentKeymap.ts:108-119,193-203`).
  Not a "missing" case exactly — the *current* editor is strictly more
  capable here — but worth naming since it's a capability the old
  implementation never had evidence for one way or the other beyond "not
  built."

### (3) Potential contradictions
**Backspace at a nested item's own marker boundary:**
- **Old behavior:** Backspace at `offset === 0` of a nested item merges
  the item into its **previous sibling** (or no-ops if it has none) —
  never promotes/dedents the item by a level. Source:
  `mergeNodeCommand`/`handleBackspace`, `keymap.ts:373-409`,
  `commands.ts:113-179`.
- **Current ODR behavior:** at a nested item's own content-start with no
  previous sibling content to merge into ("risky" marker-boundary case),
  Backspace **dedents the item's whole subtree by one level**
  (`dedentDeltaFor`/`changesForDelta`, `listDeleteKeymap.ts:200-219`) —
  functionally *Shift-Tab*, not *merge-into-previous*.
- **Source location (old):** `packages-archived/editor/keymap.ts:373-409`,
  `packages-archived/engine/commands.ts:113-179`.
- **Source location (current):** `apps/app/src/features/markdown/editor/codemirror/list/listDeleteKeymap.ts:184-219`.
- **Why they differ:** structurally forced by the two data models. In the
  old tree model, "merge into previous sibling" is *always* a well-defined
  op regardless of nesting depth (it's just `MoveNode`+text-append against
  whatever `parent.children[myIndex-1]` is, at any level). In the current
  text-buffer model, a nested item literally *has no previous sibling
  content it is safe to text-append into* at the moment its own marker is
  about to be destroyed by a naive single-line edit — the current module's
  own doc comment (`listDeleteKeymap.ts:36-46`) frames this as filling a
  gap CodeMirror's own `deleteMarkupBackward` leaves unsafe, not as a
  reproduction of any prior editor's choice.
- **Intentional or incidental?** Appears **intentional on the current
  side** — the module's doc comment reasons carefully about why dedent
  (not merge, not delete) is the only well-defined choice under
  CommonMark's grammar. Nothing suggests the current implementation was
  aware of the old editor's merge-based behavior as a target to match or
  diverge from; the two were derived independently from their respective
  models' constraints. **Not resolved here per instructions — flagged for
  the product decision pass.**

**Multi-node/whole-line Tab-Shift-Tab scope**, noted in (2), is arguably
also a contradiction of *scope* rather than *outcome* — old refuses,
current accepts — but since old never had a defined behavior to contradict
(it's an absence, not an opposing rule), this is filed under "missing,"
not "contradiction," per the instruction to only flag genuine either/or
disagreements.

**Enter on an empty list item ("exit the list")**: worth flagging as an
*open* comparison rather than a contradiction — the old editor has **no**
such special case (§2 Enter table: "There is no 'Enter on empty item exits
the list' special case anywhere in this code"). Whether the *current*
editor's relied-upon `@codemirror/lang-markdown` default keymap has one
was **not verified in this pass** (per the user's explicit scope: only
`packages-archived` was to be read for behavior recovery; the current
editor's Enter handling lives in third-party `@codemirror/lang-markdown`
source this task didn't read). Flag, don't resolve.

---

## 8. What was not established (explicit unknowns)

- Task-checkbox interaction (click-to-toggle, keyboard-toggle, Enter/Backspace
  behavior specifically *at* a checkbox) — **[C]**, no `checked` field or
  checkbox rendering exists in the read source at all.
- Ordered-vs-bullet marker semantics, renumbering, or any marker-family
  concept — **[C]**, no marker text exists in this model.
- Home/End key behavior — **[C]**, unhandled, falls through to
  uncaptured native `contenteditable` behavior.
- Shift+Enter (line break within one item) — **[C]**, unhandled.
- Forward Delete at a collapsed caret or inline range — **[A]** confirmed
  *unimplemented* (explicit stub), so "what should it do" is **[C]**.
- Cross-node inline `range` selection (as opposed to `block-range`) —
  **[C]** for behavior, though **[A]** that the selection-reading code
  never actually produces this shape, so it's more precisely "structurally
  unreachable" than "unhandled."
- Ctrl/Alt/Cmd+Arrow word/line navigation — **[C]**, not implemented.
- Shift+Arrow to create a selection via keyboard — **[C]**, not
  implemented (only mouse drag produces `range`/`block-range`).

---

## 9. Suggested next step (not undertaken here)

Per the operator's instructions, this document stops at evidence-gathering.
The one gap worth resolving *before* the ODR expansion pass, not after, is
reading `@codemirror/lang-markdown`'s own `insertNewlineContinueMarkup` /
`deleteMarkupBackward` source (referenced repeatedly by the current
codebase's own doc comments but not read for this report) — several of the
"missing from current implementation" and "not verified" items above
(Enter-on-empty-item, most of Backspace) are *upstream* behavior the
current Clutter code explicitly defers to, and the recovered old-editor
matrix can't be meaningfully diffed against it without reading that source
too.
