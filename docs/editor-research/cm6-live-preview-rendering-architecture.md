# CM6 Live-Preview Rendering Architecture — Research (No Implementation)

**Status: research/architecture-decision document only. No code was written or
modified to produce this. Nothing here is Locked** until it's explicitly
promoted into [`editor-architecture-decisions.md`](../editor-architecture-decisions.md).

This answers a single question in depth: **how should Clutter render Markdown
constructs (`**bold**`, `[[WikiLink]]`, `# Heading`, `- [ ] Task`, …) with
syntax hidden/styled while `state.doc` stays the one and only source of
truth, without breaking any native CM6 editing behavior** — the thing the
previous attempt broke, and that commit `58c7d9d7` reset.

Evidence comes from three independent passes, each cited inline:

1. **Forensics** — `git show`/`git log` on `58c7d9d7`, `45aa9a75`, `89747a4d`,
   plus a full read of [`clutter-editor-shared-token-interaction-contract.md`](./clutter-editor-shared-token-interaction-contract.md)
   and the dormant `semanticToken/tokenDecorations.ts` — what Clutter itself
   already tried and why it broke.
2. **CM6 source** — the actual npm-published `dist/index.js`/`dist/index.d.ts`
   for the versions this repo has pinned (`@codemirror/view@6.43.9`,
   `@codemirror/state@6.7.1`), not just prose docs — what CM6 actually
   guarantees vs. requires configuration for.
3. **Real implementations** — Obsidian's public `editorLivePreviewField` API
   and community plugins, `kenforthewin/atomic-editor`,
   `blueberrycongee/codemirror-live-markdown`, Zettlr, and CM6's own
   `codemirror.net/examples/decoration/` — what serious projects actually
   ship and what broke for them.

Throughout, claims are tagged:
**[G]** CM6-guaranteed · **[C]** CM6-supported but requires configuration ·
**[Clutter]** requires Clutter-specific implementation · **[Avoid]** confirmed
anti-pattern.

---

## 1. Why the previous attempt broke — confirmed root cause

Not the decorations. The dormant `semanticToken/tokenDecorations.ts` shows a
structurally sound pattern already in place: a `ViewPlugin` walks
`syntaxTree(view.state)` over `visibleRanges`, skips any node where
`isTokenEngaged()` (a selection-containment check) is true, and otherwise
emits `Decoration.replace({ widget })`, with a parallel `atomicRanges`
provider reusing the same at-rest range set. Per-file audit comments in the
reset commit confirm each of ~30 dormant `*Decoration.ts` files was checked
for "behavioral coupling — keymap registration, `atomicRanges`,
`transactionFilter`" and **found to have none** — they were disabled
defensively, not because they were the bug.

The actual bugs, all confirmed by reading the removed source in
`45aa9a75`/`58c7d9d7`:

- **Manual Arrow-key cursor hops.** `semanticToken/tokenKeymap.ts` and
  `wikilink/wikiLinkKeymap.ts` intercepted `ArrowLeft`/`ArrowRight` and
  called `view.dispatch({ selection: { anchor: ... } })` by hand to
  fake a "hop to boundary, second press enters" gesture — **[Avoid]**.
  This duplicates what `EditorView.atomicRanges` already does natively for
  free, and once decorations were dormant it degraded into overriding CM6's
  correct default placement on what was, at that point, ordinary editable
  text (`editor-architecture-decisions.md`, "Superseded 2026-08-23").
- **A parallel hand-rolled drag-selection "atomic sweep" corrector**
  (`tokenSelectionSnap.ts`) — same category of anti-pattern, also removed.
- **Custom Backspace/Delete/Enter/Tab keymaps racing `@codemirror/lang-markdown`'s
  own defaults at `Prec.high`.** `listDeleteKeymap.ts` had to win a tiebreak
  against lang-markdown's own Backspace handler for the same key — two
  competing keymap layers fighting over one keystroke — **[Avoid]**.
- **Enter left unbound at the CM6 level** in one intermediate state, which
  fell through to the browser's native `contentEditable` paragraph-split,
  which CM6 then had to reconcile via DOM-mutation observation after the
  fact — the documented source of double-newline/stuck-focus symptoms.
  Confirms: **never leave a structural key unbound and rely on DOM-diffing
  to reconcile after the browser has already mutated the DOM** — **[Avoid]**,
  and independently confirmed as a real, not just theoretical, failure mode
  by `atomic-editor`'s HN bug reports ("no matter where I typed, my text was
  ending up at the end of the document").

**The one-line takeaway**: the previous break was 100% a *keyboard/selection
command* problem (hand-rolled command logic competing with or duplicating
CM6's native command layer), not a *decoration* problem. This reframes the
whole task: decorations/widgets are the easy, low-risk part; commands are
the part that must be touched with extreme care, if at all.

---

## 2. The critical rendering model

### A. `Decoration.mark()` vs `Decoration.replace()`

Both extend `RangeValue`; the deciding field is `RangeValue.point`
**[G, source-verified]**. `replace`/`widget` are non-empty *point* ranges:
*"a point range is treated as atomic and shadows any ranges contained in
it."* `mark()` is not a point range.

| | `Decoration.mark()` | `Decoration.replace()` |
|---|---|---|
| DOM | original text nodes kept, wrapped/styled | text nodes **removed from DOM**; widget (or nothing) substituted |
| Cursor placement | fully native — CM6 does nothing special | native browser behavior: no text nodes ⇒ no caret positions inside, for free, with zero config |
| Keyboard nav (arrows/Home/End/word) | fully native | native — the replaced range simply isn't addressable by character |
| Backspace/Delete | fully native, character-by-character | deletes the *whole* range in one step *only if combined with `atomicRanges`* — reported directly on `discuss.codemirror.net` as the exact bug pattern to avoid when `atomicRanges` is misapplied to what should be char-editable text |
| Mouse click/drag | fully native | click lands at the nearest addressable boundary; drag simply can't select "inside" |
| IME/composition | fully native, and CM6 avoids re-diffing under an active composition regardless | same protection applies; risk is only if the replaced range abuts/overlaps the live composition range — untested by any source found, flag as **empirically unverified** |
| Clipboard | irrelevant — copy always reads `state.sliceDoc`, never the DOM (§Clipboard below) | irrelevant, same reason |
| Line wrapping | native reflow | widget occupies its own inline box; `WidgetType.lineBreaks` must be set correctly if the widget spans lines, or CM6's layout math goes wrong |
| Bidi | native, unless `bidiIsolate` needed | must ensure the widget's contribution to bidi order is correct via `EditorView.bidiIsolatedRanges` if applicable |
| `atomicRanges` interaction | **must not** be combined for ordinary hidden marks (bold/italic) — turns normal char editing into whole-span jumps, already flagged as the anti-pattern to avoid in this repo's own prior research | **not needed** — `replace` is already structurally atomic via the DOM; `atomicRanges` is for *additional* atomicity on top (e.g. semantic tokens *at rest*, per §B below) |

**Recommendation**: `mark()` for anything the user routinely edits
character-by-character while at rest (a heading's text, a bold span's inner
text). `replace()` for anything that should behave as a single visual/logical
unit at rest (the `**`/`##`/`[[`/`]]` markers themselves; whole semantic
tokens like WikiLinks and task checkboxes).

### B. What should be hidden, for `**hello**`

Determined by combining the CM6 evidence with the confirmed working pattern
in `tokenDecorations.ts` and the real-world convergence across
`atomic-editor` and `codemirror-live-markdown`, both of which independently
arrived at the same split:

- **Combination of marks + widgets, not one uniform strategy.** `Decoration.mark()`
  the inner text (`hello`) with a `cm-strong` style class, purely additive
  styling, native text underneath. `Decoration.replace()` the `**` marker
  pairs — hidden entirely at rest, revealed (become ordinary mark-styled or
  unstyled visible text) when the selection enters the construct.
- This is *not* "replace the entire range with a widget" (option 2) — that
  would make `hello` itself uneditable char-by-char, which both real
  implementations explicitly avoid, and it is *not* "hide only the `**`"
  in isolation without a bold-styling mark on the inner text (option 1
  alone) — you'd lose the visual bold styling that's the entire point of
  rendering. It's option **3: marks (content style) + widgets (marker
  concealment)**, matching `tokenDecorations.ts`'s already-proven shape.
- **[Clutter]** — CM6 doesn't prescribe this split; it falls out of matching
  decoration type to editing intent per range within one construct.

### C. Cursor entering a rendered construct — established pattern, confirmed

Yes — this is exactly **"engagement is derived from selection,"** already
Locked in `clutter-editor-shared-token-interaction-contract.md` and
independently confirmed as the real-world convention: `obsidian-markdown-furigana`
and `codemirror-live-markdown` both intersection-test
`view.state.selection.ranges` against each construct's `[from, to)` **fresh,
on every decoration rebuild** — never stored engagement state.

How to do it without modifying the selection: the ViewPlugin's
`buildDecorations()` reads `view.state.selection` as *input* to decide which
ranges to skip decorating (leave as plain marked/unmarked text, revealing raw
`**`) — it never calls `view.dispatch({selection: ...})`. Selection flows
one way, into rendering; rendering never flows back into selection. This is
the same one-way-pipeline principle already Locked for the semantic-inline
constructs (`editor-architecture-decisions.md` §"The one-way pipeline"),
generalized to *all* Markdown constructs, not just semantic tokens.

Cursor-position granularity (`**|hello**` vs `*|*hello` etc.) is a pure
function of where `selection.ranges` intersects the syntax node's child
ranges (`EmphasisMark`/content node boundaries from the syntax tree) — no
new mechanism needed beyond "intersects `[from,to)` of the *specific
subrange*, not just the whole node." **[Clutter]**, but mechanically thin —
it's a range-intersection query per rebuild, not new state.

### D. Selection behavior

| Gesture | CM6-automatic? | Evidence |
|---|---|---|
| Click inside hidden Markdown syntax (inside a `replace` range) | Automatic — click lands at the nearest addressable DOM boundary, since there's no text node inside to click into | **[G]**, structural consequence of `replace` removing DOM nodes |
| Click inside visible rendered text (a `mark` range) | Fully native | **[G]** |
| Drag across a rendered construct | Native, but **decoration rebuilds mid-drag cause visible flicker** if not suppressed | **[Avoid]** unmitigated; `codemirror-live-markdown` fixed via a `StateEffect` that suppresses decoration diffing while `userEvent == "select.pointer"` is active |
| Select from outside → inside / inside → outside | Native selection extension; whether syntax reveals depends on your engagement query re-running each rebuild | **[Clutter]** — no CM6-native concept of "partial reveal," this is entirely your decoration logic's responsibility |
| Shift+Arrow through a rendered construct | **`atomicRanges` affects `moveByChar`/`moveVertically`, which shift-selection commands are built on** — so if a range is in `atomicRanges`, shift-arrow skips over it as one unit; mouse drag/click selection also respects `atomicRanges` per direct source read of `MouseSelectionDragging.select`/pointer-selection reconciliation — broader than the terse public doc comment implies | **[G]**, source-verified beyond documentation |
| Select an entire WikiLink | If the WikiLink at-rest range is in `atomicRanges`, a single shift-arrow or click-drag through it selects the whole thing, matching the already-Locked "semantic tokens are atomic at rest" model | **[G]**, contingent on `atomicRanges` registration |

**Requires genuine application logic**: which ranges go in `atomicRanges` at
all (a per-construct-kind decision — semantic tokens yes, ordinary emphasis
markers no, per the already-Locked distinction in
`editor-architecture-decisions.md`), and the drag-selection-flicker
suppression. Everything else in the table above is CM6-native once the
decoration/atomicRanges inputs are set correctly.

---

## 3. Document positions vs. DOM/visual positions

**CM6's selection engine operates entirely in document (`state.doc`)
coordinates, always** — this is not incidentally true, it's the architecture.
Confirmed by direct source read:

- `domAtPos`/`posAtDOM`/`coordsAtPos`/`posAtCoords`/`coordsForChar` are the
  **only** documented-correct DOM↔position mapping surface **[G]**. Each has
  an explicit, narrow correctness contract:
  - `domAtPos`: *"for positions that aren't currently in `visibleRanges`,
    the resulting DOM position isn't necessarily meaningful."*
  - `posAtDOM`: *"will raise an error when `node` isn't part of the editor
    content"* — hard-fails rather than silently guessing.
  - `posAtCoords`/`posAndSideAtCoords`: return `null` outside the rendered
    viewport unless `precise:false` is explicitly opted into (estimated
    result).
  - `coordsForChar`: returns `null` for a position "hidden inside a
    `Decoration.replace()` span" — i.e., a concealed marker position
    *structurally has no coordinates*, which is the correct outcome, not a
    bug to work around.
- **Consequence — [Avoid]**: hand-rolled DOM traversal / character counting
  to determine cursor position is an explicit anti-pattern, not just
  discouraged style. CM6's view is virtualized (chunked, viewport-limited
  DOM), so unrendered regions have no reliable 1:1 DOM mapping *at all* —
  manual traversal isn't merely fragile, it's operating on data that doesn't
  exist off-screen.
- **`atomicRanges` necessary**: whenever a *non-point* range (ordinary text
  still in the DOM) needs to behave atomically for motion/deletion/selection
  without actually being a `replace` decoration. **Harmful**: applied
  broadly to ordinary Live-Preview-hidden marks (bold/italic/etc.) — turns
  normal character editing into whole-span-at-once jumps, which is the
  documented real-world bug (`discuss.codemirror.net/t/hide-markdown-syntax/7602`)
  and matches this repo's own prior finding.
- **Widgets interfering with Backspace/Delete**: only via `atomicRanges`
  coupling (see above) — `Decoration.replace()` alone doesn't need it,
  since removed DOM content is naturally un-addressable.
- **Widgets interfering with Arrow movement**: same — only through
  `atomicRanges`, and only when deliberately configured for that construct
  kind.
- **Widgets interfering with IME**: CM6 has an internal `InputState.composing`
  counter and DOM-diffing that explicitly special-cases the composition DOM
  region (*"Must not reuse DOM across composition"*, source-verified) and a
  `suppressWidgetCursorChange` guard specifically for *"a zero-length widget
  ... inserted next to the cursor during composition."* This is a strong
  internal safety net, but **not a public contract** — no `.d.ts` guarantee
  says arbitrary `replace` ranges near an active composition are safe.
  **Treat as empirically-unverified-but-favorable**; test directly (Hindi,
  Japanese, Korean, Chinese IME) before shipping decorations that can sit
  adjacent to a construct mid-composition, e.g. the raw `**` markers of a
  bold span the user is actively typing inside.

---

## 4. Rendering update strategy

**ViewPlugin vs StateField vs `EditorView.decorations.compute()` — the
deciding rule, source-verified**: the `decorations` facet's own doc comment
draws the line precisely: *"Only decoration sets provided directly are
allowed to influence the editor's vertical layout structure. The ones
provided as functions are called **after** the new viewport has been
computed, and thus must not introduce block widgets or replacing decorations
that cover line breaks."*

- **StateField** (or any decoration input given as a static `DecorationSet`,
  eagerly recomputed on transactions) — required for anything affecting
  layout height: block widgets, multi-line replace decorations. Evaluated
  *before* viewport computation.
- **ViewPlugin** (decorations supplied as a function of plugin state) —
  the right home for viewport-scoped, non-layout-affecting inline
  decorations: syntax highlighting spans, selection-relative marker
  concealment. Only ViewPlugins get cheap, direct access to
  `view.viewport`/`view.visibleRanges`.

**For Clutter's specific case** (inline marker concealment, selection-
sensitive, syntax-tree-driven, no block-level line-count changes for the
inline constructs listed — bold/italic/strikethrough/code/WikiLink/tag/date)
→ **ViewPlugin** is correct. Block-level constructs whose *rendered* form
changes line count in a way the document's line count doesn't already
account for (if any are ever added) would need the StateField path instead
— **not currently the case** for anything in Clutter's construct matrix (§8),
since headings/blockquotes/lists/code fences all keep one visual line per
document line even when markers are concealed.

**Rebuild triggers**, from `ViewUpdate`'s own getters (`docChanged`,
`viewportChanged`, `viewportMoved`, `selectionSet`, `geometryChanged`,
`focusChanged`) — a plugin's `update()` should gate a full rebuild on:
- `docChanged` — text changed, syntax tree may have changed.
- `selectionSet` — engagement (§2C) may have changed, even with no doc
  change.
- `viewportChanged` — new lines entered the drawn region and need
  decorating (only relevant if not already covered by the doc/selection
  triggers).
- **Not** `geometryChanged`/`focusChanged` alone — no construct-level reason
  to redecorate on those.
- Configuration changes — only when Clutter's own config facet changes
  (e.g., a settings toggle for Live Preview on/off), via a separate facet
  read, not a per-update check.

**`transactionFilter`/`changeFilter` — confirmed wrong tool, source-verified,
not just suspected**: `changeFilter` has no decoration output channel at
all — it can only suppress parts of a transaction's *changes*.
`transactionFilter` can rewrite `TransactionSpec` (changes/selection/effects)
but the docs explicitly warn *"likely to break something or degrade the user
experience"* and discourage even reading `Transaction.state` inside a filter
for performance reasons. Neither has any path into the `decorations` facet.
Using either to drive Markdown rendering would also require synthesizing
selection/effects changes as a side effect of every keystroke's transaction
— precisely the class of anti-pattern §1 identifies as what broke the
previous implementation. **[Avoid]**, now confirmed at the API-contract
level, not just by this repo's own history.

**Selection changes must never mutate selection as a decoration side
effect** — mechanically enforced by construction: a ViewPlugin's decoration
provider function only *returns* a `DecorationSet`; it has no dispatch
capability of its own. The failure mode from §1 (hand-rolled
`view.dispatch({selection})` inside a keymap handler) is a different code
path entirely and must not be reintroduced there either.

---

## 5. Performance

- **Viewport-only decoration computation**: use `view.visibleRanges`, not
  `view.viewport`, for decoration purposes — CM6's own doc comment prefers
  it explicitly: *"if you are doing something like styling the content in
  the viewport, it is preferable to only do so for [visibleRanges]"* since
  it correctly excludes large collapsed sub-ranges within an otherwise-visible
  viewport. **[G]**
- **`RangeSetBuilder`**: the documented efficient-construction path —
  *"helps build up a range set directly, without first allocating an array
  of Range objects"* — with a hard ordering requirement (`from`, then
  `value.startSide`). Use it inside `buildDecorations()`, never build a
  plain array and sort. **[G/C]**
- **Gate rebuilds** on `docChanged`/`selectionSet`/`viewportChanged` per §4
  — avoid rebuilding on every cursor movement when the movement doesn't
  cross a construct boundary; the real-world `atomic-editor` project found
  ungated rebuilds firing on scroll caused iOS kinetic-scroll jank, and
  gated them to not fire on scroll-only viewport changes.
- **Incremental parsing**: `@lezer/markdown`'s parser is incremental and
  viewport-prioritized by design (Lezer's general incremental-reparse
  architecture), but the exact fragment-reuse guarantees for
  `@lezer/markdown@1.7.2` specifically were **not independently verified
  against source in this pass** — flag as needing a direct read of that
  package before relying on assumptions about off-viewport parse coverage.
  `atomic-editor`'s architecture notes independently hit this exact gap:
  off-screen content can be under-parsed and needs `ensureSyntaxTree`
  forced when full-document decoration coverage is required (e.g. before a
  full-document export or find-all).
- **Avoid full-document DOM manipulation**: a structural consequence of
  correctly scoping to `visibleRanges` — never iterate `syntaxTree` over the
  whole document inside a ViewPlugin's per-update path.

---

## 6. Clipboard

**Confirmed, source-verified, unconditional**: `EditorView`'s `copy`/`cut`
DOM event handlers build clipboard text via `state.sliceDoc(range.from,
range.to)` per selection range (or line-wise for cut-without-selection) —
**this reads the underlying `Text` document, never the DOM, never widget
output.** So for:

```
**hello**
```
rendered visually as `hello`, copying the selection copies `**hello**` (the
real doc text) **by default, with zero configuration** — `Decoration.replace()`
widgets do **not** affect clipboard content, because copy never looks at the
DOM in the first place.

The only hook that can *change* this is `EditorView.clipboardOutputFilter`
(`Facet<(text, state) => string>`) and its paste-side counterpart
`clipboardInputFilter` — needed **only** if Clutter wants copied text to
*diverge* from raw doc text (e.g. "copy as rendered plain text" as a
deliberate, separate feature). **Do not add custom clipboard handling for
ordinary copy/paste of Markdown source — CM6 already does the right thing
with no code.** **[G]**, confirming the research prompt's own instinct.

---

## 7. IME / composition

No source found (across official docs, source, or the three real-world
projects surveyed) documents a *resolved* IME-breakage bug specifically
attributable to decoration/widget rendering — this negative result should be
read as "untested territory," not "proven safe."

What's positively confirmed from CM6 source:
- A dedicated `InputState.composing` counter tracks active composition state
  and change count since composition start.
- `enforceCursorAssoc()` **early-returns during active composition** —
  CM6 deliberately suspends its own cursor-association enforcement rather
  than fight the IME.
- DOM-diff/patch machinery explicitly avoids DOM-cache reuse across a
  composition boundary (*"Must not reuse DOM across composition"*).
- A guard (`suppressWidgetCursorChange`) exists specifically to stop a
  zero-length widget from being inserted next to the cursor *during*
  composition in a way that would disrupt it.

**Practical implication for Clutter**: this is real evidence CM6's authors
took composition safety seriously in the presence of widgets, but it is an
internal safety net, not a public API contract. The concrete risk case for
Clutter is a construct whose raw markers (`**`, `[[`) sit immediately
adjacent to text the user is actively composing (e.g., typing Japanese
inside `**日本語**` while the boundary markers are concealed via `replace`).
**Required before shipping**: direct manual testing with Hindi/Indic,
Japanese, Korean, and Chinese IME, plus dead-key composition, specifically
with the cursor positioned adjacent to a concealed marker mid-composition —
**[Clutter]**, cannot be fully resolved by research alone.

---

## 8. Per-construct decoration matrix

| Construct | Raw Markdown | Desired visual | Decoration type | Widget? | Atomic range? | Selection-sensitive? | Risk |
|---|---|---|---|---|---|---|---|
| Emphasis (`*x*`) | `*hello*` | *hello* | `mark` (content) + `replace` (delimiters) | Yes, for delimiters only | No — ordinary editable text | Yes — reveal delimiters when caret inside | Low; CommonMark flanking-rule flicker on mid-typing edits at delimiter boundary (`atomic-editor` hit this — needs a stabilizing line-local re-check, not a parser change) |
| Strong (`**x**`) | `**hello**` | **hello** | Same as Emphasis | Yes | No | Yes | Low, same flicker risk |
| Strikethrough (`~~x~~`) | `~~hello~~` | ~~hello~~ | Same pattern | Yes | No | Yes | Low |
| Inline code (`` `x` ``) | `` `code` `` | `code` (styled) | `mark` content + `replace` backticks | Yes | No | Yes | Low |
| Heading (`# x`) | `# Heading` | **Heading** (styled, marker gone) | `mark` content (size/weight) + `replace` marker+space | Yes, small, for the `# ` prefix | No | Yes (marker reveals when caret at line start) | Low — single-line, no layout-height change |
| Blockquote (`> x`) | `> quoted` | indented/styled block | `mark` content + `replace` `> ` per line | Yes, per-line prefix | No | Yes | Medium — multi-line constructs need per-line prefix handling, not one range |
| Horizontal rule (`---`) | `---` | rendered rule | `replace` (whole line → widget) | Yes | Optional — whole-line delete-as-unit is a reasonable product choice | Yes — reveal raw `---` when caret on the line | Low |
| Bullet list marker (`- x`) | `- item` | • item | `mark` content + `replace` marker | Yes, small | No (already Locked: ordinary marks stay non-atomic) | Yes | Medium — interacts with the separately-Locked 3-space indentation contract (`canonical-keyboard-odr-v2.md`); marker concealment must not change what Tab/Backspace measure |
| Ordered list marker (`1. x`) | `1. item` | 1. item (styled) | Same pattern | Optional | No | Yes | Medium, same indentation-contract interaction |
| Task checkbox (`- [ ] x`) | `- [ ] task` | ☐ task (interactive) | `replace` (whole marker → clickable widget) | Yes | **Yes** — already Locked as a semantic-token-family construct | Yes, for the marker only — content stays plain editable text | Low — already implemented (`taskCheckboxActivation.ts`/`taskCheckboxMouseHandlers.ts`), pattern proven |
| WikiLink (`[[x]]`) | `[[Page\|Alias]]` | Alias (clickable) | `replace` (whole token → widget) at rest | Yes | **Yes**, already Locked | Yes — reveal raw `[[...]]` when caret inside | Low — pattern already fully specified in `clutter-editor-shared-token-interaction-contract.md`, just needs re-wiring |
| Tag (`#x`) | `#project` | styled pill | `replace` at rest | Optional (can be pure `mark` styling, no widget needed) | Product choice — not required for correctness | Yes | Low |
| Date (`@due:...`) | `@due:2026-08-25` | styled/resolved | `replace` at rest for the token | Yes | Yes, already Locked (semantic-token family) | Yes | Low — pattern proven |
| Table | pipe-delimited rows | rendered grid | `replace` (block widget) for at-rest view; raw text while caret inside the table's row range | Yes, substantial (real DOM table) | Whole-table atomic delete is a reasonable, precedented choice (`atomic-editor` does this) | Yes — whole table vs. per-row/per-cell needs a defined boundary | **High** — genuinely the hardest construct; needs its own focused design pass, not covered by the shared inline mechanism (which is explicitly scoped to *inline* constructs only, per the already-Locked scope note) |
| Fenced code block | ` ```lang\ncode\n``` ` | syntax-highlighted block, fence markers dimmed/hidden | `mark` for content (syntax highlight) + `replace`/style for fence lines | Optional — fence lines can be styled rather than replaced | No — content must stay freely, char-by-char editable | Marker-line-only sensitivity (dim fences unless caret on that line) | Medium — must not let concealment interfere with code content editing at all; safest choice is styling-only for fences, no `replace` |

**Cross-cutting note**: every row with "Atomic range? No" reconfirms §1/§2's
core finding — `atomicRanges` should touch *only* the already-Locked
semantic-token family (WikiLink, Tag, Date, Task) at rest, never ordinary
formatting markers, and this matrix makes that scope explicit per construct
rather than as one blanket rule.

---

## 9. The one-way pipeline principle — evaluated

```
state.doc → syntax tree → rendering projection → decorations/widgets
```
**Correct, and now confirmed as the actual CM6 architecture, not just
Clutter's own convention.** Every piece of source evidence supports it:
- Decorations/widgets are pure functions of `(state, viewport)` inside a
  ViewPlugin/StateField — there is no CM6-native path from rendered DOM back
  into `state.doc` other than the browser's own native `beforeinput`/
  `compositionend` events, which CM6 already turns into ordinary
  document-coordinate transactions via its DOM-observer layer.
- The reverse pipeline (`rendered DOM → determine Markdown state → manipulate
  document`) is exactly what broke previously: the DOM-mutation-reconciliation
  path for unbound Enter (§1), and manual `view.dispatch({selection})` calls
  computed from where a token *visually* sat.

**Exceptions, both already correctly scoped as narrow**:
- **Serialization** (already Locked, per `editor-architecture-decisions.md`):
  fires once, at insertion time (e.g. autocomplete accepting a WikiLink
  completion) — this is `projection → doc`, but only as a one-shot insert,
  never an ongoing re-derivation of existing text. Doesn't violate the
  pipeline; it's the pipeline's own defined entry point for *new* content.
- **Native DOM input reconciliation** (typing, IME composition,
  contentEditable mutation) — CM6's own DOM-observer converts real user
  input events into document-coordinate transactions. This looks like
  "DOM → doc" but is CM6's foundational input mechanism, not a Clutter-built
  reverse-inference — it's not reading rendered *state* to *infer* Markdown
  meaning, it's turning literal keystrokes into text edits, which then flow
  forward through the same one-way pipeline on the next render.

No further exceptions are needed or should be added.

---

## 10. Recommended Clutter architecture

### Diagram

```
                    ┌─────────────────────────────┐
                    │         state.doc            │  ← sole source of truth
                    │   (canonical Markdown text)   │
                    └──────────────┬────────────────┘
                                   │  syntaxTree(state)
                                   ▼
                    ┌─────────────────────────────┐
                    │   @lezer/markdown syntax tree │  ← incremental, viewport-prioritized
                    └──────────────┬────────────────┘
                                   │  + state.selection  (read-only input)
                                   ▼
                    ┌─────────────────────────────┐
                    │   ViewPlugin.buildDecorations │  ← per construct-kind projector
                    │   (per-kind engagement check:  │
                    │    selection ∩ node range?)    │
                    └──────────────┬────────────────┘
                                   │
                     ┌─────────────┴─────────────┐
                     ▼                             ▼
            Decoration.mark()              Decoration.replace()
          (content styling —              (marker concealment —
           bold/italic text,               **, ##, [[, ]] —
           stays char-editable)             widget or nothing)
                     │                             │
                     └─────────────┬─────────────┘
                                   ▼
                    ┌─────────────────────────────┐
                    │     EditorView.decorations    │
                    └──────────────┬────────────────┘
                                   │  (separately, only for the
                                   │   already-Locked semantic-
                                   │   token family at rest)
                                   ▼
                    ┌─────────────────────────────┐
                    │    EditorView.atomicRanges     │
                    └─────────────────────────────┘

  Commands (Arrow/Backspace/Delete/Enter/Tab/undo/autocomplete/fold)
  ─────────────────────────────────────────────────────────────────
  Stay on CM6's native command layer + @codemirror/lang-markdown's
  own defaults. No Clutter keymap re-implements or races these for
  the same key. Only additive commands (task-checkbox activation,
  WikiLink click-to-open) attach via click handlers / a defined
  Enter-at-adjacent-token binding — never via cursor-motion overrides.
```

### Data flow

`state.doc` change or selection change → transaction dispatched through
CM6's normal pipeline (native commands, no Clutter interception) → new
`EditorState` → `syntaxTree(state)` (incrementally reparsed) →
ViewPlugin's `update()` checks `docChanged || selectionSet ||
viewportChanged` → if true, `buildDecorations()` walks `visibleRanges`,
intersects each syntax node against `state.selection.ranges` to decide
engaged vs. at-rest, emits a `RangeSetBuilder`-built `DecorationSet` mixing
`mark`/`replace` per §2B → CM6 renders → done. Selection is *read*, never
written, by this whole path.

### CM6 APIs to use
`Decoration.mark`, `Decoration.replace`, `WidgetType` (with `eq()` and
`ignoreEvent()` implemented deliberately, not left default), `ViewPlugin`,
`EditorView.decorations` (function-provided, viewport-scoped),
`EditorView.atomicRanges` (scoped narrowly, per §8), `syntaxTree`,
`RangeSetBuilder`, `view.visibleRanges`, `posAtDOM`/`domAtPos`/`coordsAtPos`/
`posAtCoords`/`coordsForChar` (only if any custom coordinate-dependent UI is
ever needed — not required for the core rendering path), `state.sliceDoc`
(already the clipboard default, no action needed), the existing
`@codemirror/lang-markdown` command defaults (`insertNewlineContinueMarkup`,
`deleteMarkupBackward`, etc.) unmodified.

### CM6 APIs to explicitly avoid
`transactionFilter`/`changeFilter` for rendering (§4/§9) — **[Avoid]**.
Hand-rolled `view.dispatch({selection: ...})` inside a keymap handler as a
substitute for `atomicRanges` (§1) — **[Avoid]**. Manual DOM traversal for
position mapping instead of the documented `posAtDOM`/`coordsAtPos` family
(§3) — **[Avoid]**. `atomicRanges` applied to ordinary Live-Preview-hidden
marks (bold/italic/heading text/etc.) rather than only the semantic-token
family — **[Avoid]**. Any custom `clipboardOutputFilter`/`clipboardInputFilter`
for ordinary copy/paste — unnecessary, CM6's default is already correct
(§6).

### How each native behavior stays native
- **Cursor movement (Arrow/Home/End/word)**: untouched CM6 defaults;
  `atomicRanges` (semantic tokens only) is the sole mechanism that alters
  step granularity, and it's CM6-native, not hand-rolled.
- **Backspace/Delete**: untouched `@codemirror/commands` defaults +
  `@codemirror/lang-markdown`'s own Markdown-aware deletion; no competing
  Clutter keymap at the same precedence.
- **Enter**: `insertNewlineContinueMarkup` (lang-markdown default) stays
  bound; never leave Enter unbound at the CM6 level (§1's confirmed
  regression).
- **Tab/Shift-Tab**: lang-markdown/`@codemirror/commands` defaults, composed
  with (not raced against) the already-Locked 3-space indentation contract
  from `canonical-keyboard-odr-v2.md` — that contract governs *what* Tab
  writes; this document does not reopen it.
- **Undo/redo**: entirely CM6-native — decorations are pure derived
  projections of `state.doc`, never part of the undo-tracked state, so
  nothing about this rendering design touches undo at all.
- **Close brackets / autocomplete**: `@codemirror/autocomplete` untouched;
  WikiLink/tag/mention completion already specified as insertion-only in
  the existing Locked semantic-resolution model — no interaction with the
  rendering layer beyond triggering off the same syntax tree.
- **Folding**: `@codemirror/language`'s fold machinery is independent of
  this rendering layer; not touched by anything here.
- **IME**: relies on CM6's internal composition-safety machinery (§7);
  requires manual verification before ship, not a code-level guarantee this
  document can provide.
- **Clipboard**: CM6-native, zero configuration required (§6).

### Performance
Viewport-scoped (`visibleRanges`) decoration computation, gated rebuilds
(`docChanged`/`selectionSet`/`viewportChanged` only), `RangeSetBuilder` for
construction, `ensureSyntaxTree` forced only where full-document coverage is
genuinely required (e.g. export), never in the interactive rendering path.

---

## Open questions this research leaves genuinely unresolved

- **Table rendering** needs its own dedicated design pass — it's explicitly
  the one construct that doesn't fit the shared inline mechanism (already
  scoped as inline-only) and the one real-world project surveyed
  (`atomic-editor`) that implemented it flagged rough edges even there.
- **IME safety with concealed markers immediately adjacent to an active
  composition range** — CM6's internal safety net is encouraging but not a
  public contract; needs direct manual testing (Hindi, Japanese, Korean,
  Chinese, dead keys) before shipping, not something this research can
  close out.
- **Whether re-enabling Live Preview needs any selection-assistance beyond
  `atomicRanges`** — carried forward, unresolved, from
  `editor-architecture-decisions.md`'s "Superseded 2026-08-23" note; this
  document's position is that `atomicRanges` should be tried first and
  proven insufficient before anything more is built, given §1's forensic
  finding that the previous hand-rolled mechanism was solving a problem
  `atomicRanges` already solves natively.
- **CommonMark emphasis-flanking flicker during active typing** — both
  real-world projects surveyed hit this and needed a stabilizing per-line
  re-check; the exact shape of that fix for Clutter's parser/grammar is not
  designed here.
- **Exact incremental-reparse fragment-reuse behavior of
  `@lezer/markdown@1.7.2`** — flagged but not independently verified against
  that package's own source in this pass.
