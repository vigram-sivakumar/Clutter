# List Item Architecture — ODR (Bullet + Ordered Lists)

**Status: living source-of-truth document.** This is not a snapshot of one
session — it is the authoritative reference for bullet- and ordered-list-
item behavior in Clutter's Markdown editor, and the required starting
point for task-list work. When a future change alters any shared rule
described here, **update this document in place** rather than writing a
second, competing account of the same behavior.

**Scope**: unordered/bullet list items (`-`, `*`, `+`) and ordered list
items (`1.`, `1)`, ...). Task checklists are not implemented (rendering-
wise) as of this writing — §12 records what's genuinely transferable to
them and what remains open. §13 (2026-08-29) is the ordered-list
extension: everything investigated, decided, implemented, and verified
when bullet-only rendering was extended to also cover ordered markers,
sharing the same-line-collapse mechanism across both kinds.

**How to read this document**: every claim is labeled with its evidence
status —

- **IMPLEMENTED + VERIFIED** — shipped in the current tree, confirmed by an
  automated test or a direct, reproduced live observation recorded here.
- **INVESTIGATED + REJECTED** — a real alternative was built or traced in
  detail and deliberately not adopted; the reasoning is preserved so it is
  never silently re-litigated.
- **ACCEPTED LIMITATION** — a known, understood gap that will not be fixed
  without a larger, deliberately-scoped change (custom CM6 rendering,
  typing interception, etc.). Not a bug to "just fix."
- **NOT YET INVESTIGATED** — genuinely open. Never guessed at.

All source excerpts below were re-read from the working tree while writing
this document (2026-08-29), not reconstructed from memory of the
conversation that produced them.

---

## 0. Current enabled/disabled state (read this first)

Everything below is **currently wired and active** in
[`MarkdownEditor.tsx`](../apps/app/src/features/markdown/editor/MarkdownEditor.tsx):

| Extension | File | Status |
|---|---|---|
| `listMarkerDecoration()` | `codemirror/list/listMarkerDecoration.ts` | **Enabled** — renders both bullet and ordered markers (§13), sharing one same-line-first-marker-only policy across both kinds (§7/§13) and the bullet-only `*→•` substitution (§3) |
| `listMarkerCaretAssoc()` | `codemirror/list/listMarkerDecoration.ts` | **Enabled** — the content-start caret-touch fix (§4), kind-agnostic since §13 (queried for ordered content-start too, though ordered markers are not expected to actually need it — see §13) |
| `markdownEnterKeymap()` | `codemirror/enter/markdownEnterKeymap.ts` | **Enabled** — bundles every Enter/Backspace policy in §6, §8, and §13, including `continueFirstSameLineListLevel` (§6/§13, renamed from `continueFirstSameLineBulletLevel`), `preserveListMarkerOnContentStartSplit` (renamed from `preserveBulletMarkerOnContentStartSplit`, now bullet+ordered), and `deleteBulletMarkerSeparator` (§8/§13, now bullet+ordered despite its retained bullet-era name) |
| `markdownIndentKeymap()` | `codemirror/indent/markdownIndentKeymap.ts` | **Enabled** — the uniform per-line Tab/Shift-Tab described in §9, already construct-agnostic and unchanged by §13 |

Nothing described in this document as "current" is behind a flag, a
prototype toggle, or commented out. Where a document comment in the source
still says "TEMPORARY PROTOTYPE," that reflects the comment having not
been renamed yet, not the code being inactive — verified directly by
reading `MarkdownEditor.tsx`'s own extension list, not inferred from
comments.

**As of this writing, none of the git history above the single commit
`084e1518` has landed** — i.e. only the `*→•` + content-start caret fix
have been committed; the same-line-first-marker decoration rule and the
`continueFirstSameLineBulletLevel` Enter fix are live in the working tree
but **uncommitted**. This document describes the working tree's actual
behavior regardless of commit status — check `git status`/`git log` for
the current commit boundary before relying on this note past this
writing.

---

## 1. Source / parser model

### What `state.doc` actually contains

Clutter never stores anything except the literal Markdown a user typed,
pasted, or loaded. There is no second document model, no AST-as-source,
no rewriting on read. This is a pre-existing, Locked, foundational
principle of the whole editor (`docs/editor-architecture-decisions.md`),
and every bullet-list mechanism in this document obeys it without
exception — confirmed empirically for every construct described below,
not merely assumed.

For `- Text`: `state.doc.toString() === "- Text"`. Nothing else exists.

### `ListItem` / `ListMark` / separator / content-start

Verified directly against the installed `@lezer/markdown@1.7.2` grammar
(`markdownGrammarExtensions.ts`, `markdownLanguage.ts` — CommonMark +
GFM `TaskList`/`Strikethrough`/`Table`/`Autolink`, plus Clutter's own
`WikiLink`/`Tag`/`Date`/horizontal-rule variants, with `IndentedCode`
removed — see that file for the full extension list and why
`IndentedCode` is disabled):

- A bullet list item parses as `ListItem` inside a `BulletList`.
- `ListItem.firstChild` is **always** `ListMark` — for bullet, ordered,
  and task markers alike. Confirmed directly, not assumed
  (`listMarkerDecoration.test.ts`, "node shape, verified against the real
  installed parser").
- `ListMark` covers only the literal marker character(s) — `-`, `*`, `+`
  for bullets. It does **not** include the separator whitespace after it.
- **The separator is never its own syntax node.** `ListMark`'s next
  sibling is whichever real content node follows (`Paragraph`, a nested
  `BulletList`, etc.), with an unclaimed gap of raw whitespace between
  them. `getBulletMarkRange`/`separatorRangeAfter`
  (`listMarkerDecoration.ts`) computes this gap directly from the
  document, bounded to the marker's own physical line — confirmed by
  direct inspection of a real parsed tree (`"-\n  - nested"`) that a
  nested list can be `ListMark`'s next sibling starting on a *later*
  physical line, which an ungated "whitespace-only gap" check would
  misidentify as separator whitespace.
- **Content-start** = the end of that separator range (`separator.to` in
  `getBulletMarkRange`'s return value). For `"- Text"`, content-start is
  document position `2` — immediately before `T`.
- A **bare marker** (`"-"`, nothing after it — mid-keystroke, before the
  separator space is typed) is a syntactically valid, complete, *empty*
  `ListItem` per CommonMark. Confirmed directly: `ListMark[0,1)` for
  `"-"` is byte-identical to `ListMark[0,1)` for `"- "`. Clutter's
  rendering deliberately does **not** decorate a bare marker (§2) — a
  product gate, not a parser fact.
- CommonMark permits 1–4 spaces of separator before the marker "gives
  up" and the line stops being that item's own first line at all.
  `-  Text`/`-   Text` (2–3 space separators) are valid, non-canonical
  Markdown; `getBulletMarkRange` marks the *actual* separator width, not
  an assumed single space.

### Genuine multi-line nesting vs. same-line collapsing (the critical ambiguity)

This is the single most important parser fact this document exists to
record precisely, because it drives §6 and §7 entirely.

**A `- ` line is a syntactically complete, empty list item.** CommonMark
permits an empty item's own content to immediately be *another* list —
no newline, no indentation required. So:

```
Source: "- - - - Text"
```

parses (verified with the actual installed grammar — see the tree dump
below, reproduced via a throwaway script against
`markdown({ extensions: markdownGrammarExtensions, addKeymap: false })`,
the exact config the editor uses) as **four levels of `BulletList`
nesting, all on one physical line**:

```
Document [0,12)
  BulletList [0,12)
    ListItem [0,12)
      ListMark [0,1) "-"
      BulletList [2,12)
        ListItem [2,12)
          ListMark [2,3) "-"
          BulletList [4,12)
            ListItem [4,12)
              ListMark [4,5) "-"
              BulletList [6,12)
                ListItem [6,12)
                  ListMark [6,7) "-"
                  Paragraph [8,12) "Text"
```

This is **correct, standard CommonMark** — not a Lezer bug, not a grammar
misconfiguration. Every `ListMark` above is a real, independently valid
node.

**A related, separately-discovered ambiguity**: a line of *exactly*
dashes-and-spaces with **no other content** does not always parse as
nested lists at all. `"- - - "` (three dashes, trailing space, nothing
else) parses as a single `HorizontalRule` — GFM's thematic-break rule
wins over "three empty nested list items" whenever the *entire* line
matches only that repeating-character-and-space pattern. Add real content
(`"- - - - hey"`) and the thematic-break reading is no longer possible
(a thematic break cannot have trailing text), so the nested-list reading
returns. This was reproduced live (typing `"- - - "` renders as
completely plain, undecorated text — zero `ListItem`s exist at that
instant — and appending `hey` immediately produces four decorated-down-
to-one markers). The same effect reproduces with 10 bare `- ` repeats
(also a `HorizontalRule` until real content is appended). **This is an
upstream CommonMark/GFM characteristic, not something Clutter's grammar
introduces or could reasonably suppress** — see `markdownGrammarExtensions.ts`
for the exact GFM subset enabled.

### Why we do not modify Lezer/parser behavior

Two independent, sufficient reasons, both already established and Locked
elsewhere in this codebase before this investigation began
(`docs/editor-architecture-decisions.md`):

1. **Markdown remains the sole canonical source of truth**, and Clutter
   syntax extensions only ever claim text that would otherwise be
   literal — bullet-list nesting is native CommonMark, not a Clutter
   extension point, so there is no sanctioned mechanism to reinterpret it
   without diverging from CommonMark itself (breaking interop with every
   other Markdown tool that opens the same file).
2. **A structural fact about a document must not depend on how it was
   typed.** The parser is stateless with respect to keystroke history —
   it parses whatever `state.doc` currently contains. `"- - - - Text"` is
   four nested `BulletList`s whether it was typed one keystroke at a
   time, pasted in one operation, or loaded from disk. Any attempt to
   make the *parser* treat repeated same-line markers differently would
   require it to remember typing history, which no Lezer parser does or
   should do — this was the deciding argument against typing-time
   interception in §7 as well.

The fix implemented for the "looks like a bug" same-line case (§7) is
therefore a **rendering-layer policy**, never a parser change — the tree
above is exactly what Clutter's renderer, Enter command, and every other
consumer see and must work with as given.

---

## 2. Rendering architecture

### Final architecture, precisely

**`Decoration.mark`, real source text, no widget, no concealment.**
Implemented in
[`listMarkerDecoration.ts`](../apps/app/src/features/markdown/editor/codemirror/list/listMarkerDecoration.ts),
wired via `listMarkerDecoration()` in `MarkdownEditor.tsx`.

The marker span wraps the **real marker character + real separator
whitespace** (e.g. `"- "`, `"*   "` for a non-canonical 3-space
separator) — never a substitute, never a widget standing in for hidden
source. `state.doc` and the DOM's own text content agree exactly at every
position inside the span (verified: `Selection.toString()` over a marker
span returns the literal characters, not a painted glyph — see §3 for
the one deliberate visual exception).

### DOM example (current, exact)

For `- Text` (unengaged or engaged — there is no reveal/conceal state,
see below):

```html
<div class="cm-line">
  <span class="cm-bullet-list-marker cm-bullet-list-marker--glyph cm-bullet-list-marker--dash"
        data-marker-glyph="-">- </span>Text
</div>
```

For `+ Text`:

```html
<span class="cm-bullet-list-marker cm-bullet-list-marker--glyph cm-bullet-list-marker--plus"
      data-marker-glyph="+">+ </span>Text
```

For `* Text` (see §3 for why the glyph and class differ from the literal
character):

```html
<span class="cm-bullet-list-marker cm-bullet-list-marker--glyph cm-bullet-list-marker--dot"
      data-marker-glyph="•">* </span>Text
```

In every case the text node inside the span is the **real, unmodified**
`"- "`/`"+ "`/`"* "` — confirmed live via `document.createRange()` over
that text node returning exactly those characters.

### No reveal/conceal state

Unlike every other marker-hiding construct in this codebase (emphasis,
heading, blockquote's own concealed state), the bullet marker has **no
engaged/at-rest distinction at all**. `- Bullet` always renders as
`- Bullet` — never concealed, never swapped for a different glyph, in
both "cursor on this line" and "cursor elsewhere" states. This was an
explicit, deliberate product requirement, verified live before landing
(an isolated, CSS-less `Decoration.mark` probe was mounted and every
gesture — click, arrow-key stepping, Backspace/Delete at the boundary —
behaved exactly like ordinary undecorated text).

### 20px marker column

`--marker-width` (`design-system/tokens.css`) resolves
`--marker-width → --height-xs → --space-20 → 20px`. The marker span is:

```css
.cm-editor .cm-bullet-list-marker {
  display: inline-block;
  width: var(--marker-width);   /* 20px */
  color: var(--marker-foreground);
  text-align: left;             /* see §5 for why this is `left`, not `center` */
  text-indent: 0;
}
```

`text-indent: 0` resets the inherited value: this element is itself
`display: inline-block`, establishing its own formatting context, so
without this reset it would inherit any ancestor line's own negative
`text-indent` (used elsewhere for blockquote's hanging indent) a second
time and shift the marker glyph incorrectly.

### Why `Decoration.mark`, not `Decoration.replace`/widget — INVESTIGATED + REJECTED alternative

The **prior, retired architecture** (`ListBulletWidget.ts`, git commit
`b485cb3e` "list bullet progress day 1" through `40d820c1`) used
`Decoration.replace` with a widget rendering a `•` glyph in the marker's
place. It was never an approved decision — no rationale was ever
recorded for it — and had a real, traced defect:

> A click landing exactly at content-start (the position immediately
> after the replaced range — the legitimate resting position before the
> item's own text) was misidentified by `liveMarkSelectionSnap.ts` as
> "inside the replaced range" and redirected backward into the marker.

Root cause, generalized: **a `Decoration.replace` range paints zero
pixels**, so a click aimed at "just past the visible content" and a click
aimed at "the invisible replaced thing" land on the identical pixel; the
browser's native hit-testing always resolves that tie toward whichever
side has real rendered content — never toward the empty side. A real,
source-backed `Decoration.mark` has no replaced range for any such
correction to exist for, because content-start is simply the boundary
between two ordinary, always-real text runs.

This was re-confirmed, not merely inherited as folklore, during the
`*→•` investigation (§3): the exact same zero-width hit-testing ambiguity
was independently rediscovered and is the reason the `*→•` fix could not
use `Decoration.replace` either.

**Migration commits**: `6cad7d53`/`c2eacd0d` (revert)/`3c5648d1` (final)
— "bullet marker is a real, source-backed `Decoration.mark`," landed
2026-08-29, confirmed via a side-by-side prototype (isolated `EditorView`,
real `coordsAtPos`/click testing) that a `Decoration.mark`-based marker
resolves every tested caret/click position correctly, at every nesting
depth, with identical line-height geometry to an undecorated line — zero
boundary-correction code needed.

### Why marker/separator are one combined `Decoration.mark`, not split — INVESTIGATED + REJECTED alternative

Splitting the marker character and its separator into two adjacent
`Decoration.mark`s (`<span>-</span><span> </span>`) was investigated
specifically to give the marker glyph its own independently-sized box
(relevant to the selection-gap investigation, §5) but was **not** adopted
for bullets:

- It is unnecessary for the shipped rendering: one combined mark, sized
  to the full 20px column via `text-align`/pseudo-element positioning
  (§3), already achieves correct visual placement without a second span.
- Splitting would not, by itself, have fixed the selection-boundary gap
  (§5) — that gap's root cause is `coordsAtPos` tracking the real glyph's
  rendered position, which is unaffected by how many spans wrap it.
- Blockquote's own marker (`blockquoteMarkerDecoration.ts`) explicitly
  tried and rejected a two-span split for a *different* reason (it wants
  one continuous background/border band across marker+separator) — see
  that file's own doc comment: splitting produced two sibling spans
  instead of the desired single continuous box. Bullets never needed that
  visual treatment, so this was never a live option in the first place,
  not a rejected requirement.

**Current state: marker + separator remain one `Decoration.mark`, exactly
as originally shipped.**

---

## 3. `* → •` implementation

### What's real vs. painted

- **Real, in `state.doc` and the DOM text node**: `"* "` — the literal
  asterisk and its separator, byte-for-byte, always.
- **Painted, via a CSS pseudo-element only**: `•`. The pseudo-element is
  generated content (`::before`), which is excluded from the
  Selection/Range model by spec — it cannot be selected, cannot take the
  caret, and does not add a DOM text node. `Selection.toString()` over
  the marker span returns the literal `"* "`, never `"•"` — confirmed
  live.

### Mechanism, exactly

```css
.cm-editor .cm-bullet-list-marker--glyph {
  position: relative;
  color: transparent;
}

.cm-editor .cm-bullet-list-marker--glyph::before {
  content: attr(data-marker-glyph);
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  color: var(--marker-foreground);
}

.cm-editor .cm-bullet-list-marker--dot::before {
  font-size: 1.5em;
  left: 3px;
  bottom: 3px;
  line-height: 0;
}
```

`data-marker-glyph="•"` is set per-instance by
`listMarkerDecoration.ts`'s `markerMark()` — one shared `::before` rule
reads it via `content: attr(...)` instead of three separate
`content: '-'`/`'+'`/`'•'` rules. `-`/`+` get the identical mechanism
(`--glyph`/`--glyph::before`) with their own literal character as
`data-marker-glyph`, so this is one uniform technique across all three
markers, not a dot-specific special case (see below for why `-`/`+` also
need it).

`color: transparent` on the real text (not `display: none`, not
`visibility: hidden`) keeps it a real, hit-testable, selectable DOM text
node — only its paint is suppressed. `position: absolute` on the
`::before` takes it fully out of normal flow: it cannot affect the real
text's layout width, and cannot contribute to `.cm-line`'s line-height
regardless of its own `font-size`.

### Why `-`/`+` also go through this mechanism (not just `*`)

This is a secondary, later fix layered onto the same rule, not part of
the original `*→•` work: `.cm-bullet-list-marker`'s `text-align` was
changed from `center` to `left` to fix the §5 selection-gap defect. That
change only matters if the real text's *visual* position no longer needs
to match its *layout* position — which requires the real text to be
invisible (`color: transparent`) and *something else* to paint the
visible glyph at the old, correct-looking spot. So `-`/`+` needed the
identical transparent-text-plus-painted-pseudo-element treatment as `*`,
purely to preserve their existing visual appearance after the layout
change — not because `-`/`+` themselves needed a glyph substitution.
`data-marker-glyph="-"` and `data-marker-glyph="+"` are simply the
literal characters, painted instead of laid out.

### Why `left: 3px` / `bottom: 3px` (and the per-glyph variants) are not arbitrary

These offsets exist **only because the real, transparent text now lays
out flush-left** (via the `text-align: left` fix in §5), not centered.
Before that fix, `text-align: center` positioned each glyph's *visual*
center automatically; after it, the glyph's layout anchor moved to the
box's left edge, so the *painted* glyph needs an explicit offset to land
back where it visually looked correct before the layout change.

Each glyph has its own tuned value because **each real character has a
different advance width**, and `text-align: center`'s old optical
position depended on that width. Measured directly (`Range.getBoundingClientRect()`
on the real, pre-fix centered text) before the layout change:

| Marker | Measured `text-align: center` position (inset from box's left edge) |
|---|---|
| `-` | ~4.29px |
| `*` | ~4.29px (same real advance width as `-` in this font) |
| `+` | ~3.02px (a visibly wider glyph needs less centering padding) |

The **current, shipped** per-glyph `left`/`bottom` values (re-read from
`MarkdownEditor.css` at the time of this writing) are hand-tuned from
that starting point, not identical to the raw measurements above — they
were adjusted by direct visual comparison after the mechanism changed
(font-size scaling for the dot in particular shifts what "looks right"):

```css
.cm-editor .cm-bullet-list-marker--dot::before {
  font-size: 1.5em;
  left: 3px;
  bottom: 3px;
  line-height: 0;
}
.cm-editor .cm-bullet-list-marker--plus::before {
  left: 3px;
  bottom: 1.5px;
}
.cm-editor .cm-bullet-list-marker--dash::before {
  left: 3.5px;
  bottom: 2px;
}
```

`bottom` exists for a distinct, separate reason from `left`: with
`line-height: 0` (needed to stop the dot's `font-size: 1.5em` from
inflating `.cm-line`'s measured height — see next section), the
pseudo-element's default `vertical-align: baseline` no longer lines the
glyph up with `-`/`+`'s own real, baseline-aligned text. `bottom`
provides the same kind of manual vertical correction `left` provides
horizontally, for the identical underlying reason (the pseudo-element's
box no longer has the same natural metrics the real, in-flow text did).
**These are empirically-tuned visual-parity constants, not derived from
a formula** — recorded here explicitly so no future reader assumes they
are arbitrary or safe to delete.

### Why `font-size: 0`/`transform: scaleX()` were rejected — INVESTIGATED + REJECTED

Both are the **same two techniques already rejected once**, for a
different construct (concealed inline emphasis/heading markers,
`docs/editor-architecture-decisions.md`'s own concealed-marker saga), and
independently re-confirmed inapplicable here:

- **`font-size: 0` (or near-zero) on the real text**: zeroes
  `getClientRects()` height, which `drawSelection()` reads directly to
  compute selection-rectangle geometry — a real text run shrunk this way
  produces a `0`-height selection box for that line, confirmed
  previously by direct measurement (Cmd+A painting no selection
  background for a line starting with a near-zero-font-size marker).
- **`transform: scaleX()` on the real text**: paints small but a CSS
  `transform` never changes an element's *layout* box, only its painted
  one — the marker would still reserve its full original glyph width in
  the line's horizontal layout, causing progressively more indentation
  the more/longer markers a line has (confirmed previously, this exact
  failure mode, for the concealed-marker case it was originally tried
  for).

Neither failure mode is reachable by the shipped `color: transparent` +
absolutely-positioned `::before` technique: `color` never touches
geometry, and the pseudo-element is out of flow entirely.

### Geometry/caret/selection verification (all live-tested, this session)

- **Marker box**: `20×24px` at default font size, uniformly across
  `-`/`+`/`*`, top-level and nested — unaffected by the dot's own larger
  painted glyph.
- **`.cm-line` height**: exactly `24px` on every line, dot-marker line
  included — no inflation from `font-size: 1.5em`, confirmed directly
  via `getBoundingClientRect()` on real, mounted lines.
- **Click before/between/at content-start**: offsets `0`/`1`/`2` all
  resolve exactly correctly on the dot-marker line — no snapping into
  the `::before` overlay (the failure mode `Decoration.replace` had, see
  §2).
- **ArrowLeft/ArrowRight**: steps one character at a time through `* `,
  byte-identical to plain text — no atomicity introduced by the
  pseudo-element.
- **Selection across the marker**: `Home`+`Shift+End` selects the
  literal `"* Text"` (real asterisk), non-zero selection-background
  rectangle.

### Behavior at different font sizes

Tested at `--cm-content: 24px` (1.5× default): marker box scales to
`20×36px` uniformly, `.cm-line` height scales to `36px` uniformly across
dot/dash/plus, click-before/content-start positions still resolve
exactly. **Verified at exactly one non-default size (24px)** — not swept
across an arbitrary range of sizes.

### Behavior in nested lists

A nested dot marker (`  * Nested`, one level under a `- ` parent) renders
at `left: 357.828px` — exactly `20px` (one marker column) past the
top-level box's own `337.828px` — confirmed live. The same-line-collapse
policy (§7) and the `*→•` substitution compose correctly with nesting: a
nested item gets its own independent decoration pass, unaffected by its
parent's own marker decoration (this was already true of the pre-`*→•`
architecture and remains true — `listMarkerDecoration.ts`'s own doc
comment: "Nesting requires no special handling").

---

## 4. Caret behavior — the `assoc` investigation

### The phenomenon

At the exact document position immediately before `Text` in `- |Text`
(content-start), the **same integer document position** rendered the
caret at two visually different spots depending on *how* the cursor
arrived there:

- Arriving via **ArrowLeft** (from inside `Text`, moving backward): caret
  visually touches `T`.
- Arriving via **ArrowRight** (from inside the marker, moving forward):
  caret rendered with a visible gap before `T`.

### Root cause, traced to source

`RectangleMarker.forRange` (`@codemirror/view`, the function that also
computes selection-rectangle geometry, see §5) computes the caret's
pixel rectangle via:

```js
let pos = view.coordsAtPos(range.head, range.assoc || 1);
```

`SelectionRange.assoc` (`-1`/`0`/`1`) tells `coordsAtPos` which side of
the position to measure: `-1` resolves to wherever the *preceding*
content's real text visually ends; `1`/`0` resolves to wherever the
*following* content's real text visually begins. At an inline-block
marker boundary, these can be genuinely different pixels, because the
marker's real (centered, pre-§5-fix) text ends well before the box's own
right edge.

Arrow-key motion sets `assoc` itself, unconditionally, in `moveVisually`
(`@codemirror/view`):

```js
return EditorSelection.cursor(nextIndex + line.from, span.forward(forward, dir) ? -1 : 1, span.level);
```

For plain LTR text, `span.forward(forward, dir) === forward`. So
**ArrowRight (`forward: true`) always produces `assoc: -1`**, and
**ArrowLeft (`forward: false`) always produces `assoc: 1`** — this is
generic CM6 behavior for *any* boundary with a real visual gap between
where a preceding run's real content ends and where a box/following run
begins, not something introduced by Clutter's own CSS. Confirmed via
`BidiSpan.forward`'s own one-line implementation
(`forward(forward, dir) { return forward == (this.dir == dir); }`), not
assumed.

A useful, easily-missed fact: `EditorSelection.cursor(pos)` with no
explicit `assoc` defaults to `0`, and `range.assoc || 1` treats `0`
identically to `1` — so the "good" (touching-`T`) rendering was already
the *default* whenever nothing else overrides it; only the explicit `-1`
from rightward motion produced the gap.

### The fix

`listMarkerCaretAssoc()` (`listMarkerDecoration.ts`) is an
`EditorState.transactionFilter` that intercepts a transaction's
*resulting* selection: if it is an empty cursor exactly at a bullet
item's own content-start (`bulletContentStart()`, walking `ListItem`
ancestors and comparing to `getBulletMarkRange(...).to`) with
`assoc === -1`, it is replaced with the identical position at `assoc: 1`.

`assoc` is a pure rendering/motion-continuation hint on `SelectionRange`
— never part of the document position. `head`/`from`/`to` stay the exact
same integer either way, and Backspace/Delete/insertion all operate on
those integers, never on `assoc`. Normalizing it changes **only** which
pixel the caret paints at; it was never expected to change editing
semantics, and (after the fix below) does not.

### The Backspace regression it caused, and the fix for that

**The regression was real, confirmed, and traced to a different, more
general defect than the `assoc` fix's own logic.** `EditorState`'s
`filterTransaction` (`@codemirror/state`), when a transaction filter
returns anything that is *not* a `Transaction` instance, resolves it via
`resolveTransaction(state, ...)` — against the transaction's **pre-edit**
`startState**, using only the fields the filter supplied. The filter's
first version returned a bare `{ selection: ..., scrollIntoView: ... }`
object with no `changes` field — which silently discarded whatever real
document edit the intercepted transaction carried.

Concretely reproduced: pressing Backspace to join `- ` with a following
plain-text line (`"- \nText"` → expected `"- Text"`) instead left the
document completely unchanged while moving the caret to where it would
have landed *had* the join happened — because the join itself was
resolved away. This is not a hypothetical: it was directly observed live
(document unchanged, cursor moved to the post-join position anyway) and
is fully explained by the `resolveTransaction`/`filterTransaction`
mechanics above, confirmed by reading `@codemirror/state`'s own source.

**The fix**: construct a real `Transaction` (`tr.startState.update({...})`)
instead of a bare spec, explicitly forwarding `changes`, `effects`, and
`userEvent` (the one annotation other extensions — undo grouping in
particular — actually key off; `Transaction` has no public API to
forward its full raw annotation set, so only `userEvent` is carried
explicitly):

```ts
return tr.startState.update({
  changes: tr.changes,
  selection: EditorSelection.cursor(range.head, 1),
  effects: tr.effects,
  userEvent: tr.annotation(Transaction.userEvent),
  scrollIntoView: tr.scrollIntoView,
});
```

`filterTransaction` treats an actual `Transaction` as already-resolved
and uses it verbatim, so the real edit survives.

### Current state — unambiguous

**`listMarkerCaretAssoc()` is currently ENABLED**, wired in
`MarkdownEditor.tsx`, with the fixed (Transaction-preserving)
implementation — not the earlier, regression-causing version. Verified,
in this order, after the fix:

1. `- \nText` + Backspace → `"- Text"` (correct join — matches the
   filter-disabled baseline exactly).
2. Undo correctly reverses the join back to `"- \nText"`.
3. `- Text` + Backspace at content-start → `"-Text"` (separator-only
   removal — this also independently re-confirmed that a much-earlier
   session finding of "Backspace at content-start is a no-op" was itself
   a false negative caused by sending the wrong key name to the browser
   automation tool — see the note at the end of this section — not a
   real product behavior; §8 describes the actual, correct behavior).
4. ArrowRight into content-start still lands the caret at the same pixel
   ArrowLeft does (`357.234px` vs. `T`'s own `357.828px` — touching,
   within normal caret-width tolerance).
5. `tsc --noEmit` clean; all 52 tests in `listMarkerDecoration.test.ts`
   pass.

**Methodology note, preserved because it invalidated several earlier
findings in this same investigation thread**: the browser automation used
this session sends key names matching the DOM `KeyboardEvent.key` spec.
`"BackSpace"` (capital S) is **not** a recognized key name — the correct
one is `"Backspace"`. Every earlier "Backspace is a no-op" observation in
this thread that used the wrong casing was a silent no-op from the
automation tool itself, not a real editor behavior. All findings recorded
in this document were re-verified with the correct key name.

---

## 5. Selection behavior — the 20px marker-column gap

### The phenomenon

Selecting multiple list lines (e.g. via `Cmd+A` or a multi-line
`Shift`+arrow selection) shows the selection background starting a few
pixels **inside** the 20px marker column — not flush at its left edge —
specifically on whichever line is the selection's own *boundary* row
(the line containing `selection.from` or `.to`).

### Root cause, traced to source

`RectangleMarker`'s rectangle-computation code (`@codemirror/view`,
`rectanglesForRange`/`drawForLine`/`addSpan`) has two genuinely different
code paths:

- **Interior (fully-covered) rows** use a full-line-width shortcut
  (`leftSide`/`rightSide`, derived from `.cm-line`'s own `padding-left`
  and `text-indent`, independent of any specific character's position).
  These always cover the full 20px column correctly.
- **The row containing the selection's actual `from`/`to` boundary**
  always calls `view.coordsAtPos(boundary)` — because the selection might
  start or end mid-line, so an exact pixel is required. This unavoidably
  reflects wherever the real marker text's glyph is actually rendered.

With the original `text-align: center` marker styling, `coordsAtPos` on
the boundary row measured the real (centered) glyph's own left edge —
`~340.85px`–`342.12px` (glyph-width-dependent) — against the marker
box's own true left edge at `337.83px`. The ~3–4px difference is exactly
the gap.

**This is not a bug in `drawSelection()`** — it is behaving exactly as
documented and designed (precise text-based highlighting on the
boundary row; a full-width band on interior rows, the same convention
virtually every code/text editor uses for multi-line selection
rendering).

### Comparison with blockquote — it did not actually solve this

Blockquote's own marker (`.cm-quote-marker`) uses `text-align: end`
(right-aligned, not centered) inside the identical 20px box — a
*different* alignment, but the same underlying mechanism (real text,
`Decoration.mark`, no widget). Direct measurement (this session)
confirmed blockquote has the **identical class of gap**, and in fact a
**larger** one in the case measured: `6.05px` (quote marker's own real
glyph position vs. its box edge) vs. bullet's `~3–4px`.

**Why blockquote appears unaffected**: `.cm-quote-line::before` — an
always-visible, unconditional 4px-wide decorative accent bar
(`background: var(--foreground-primary)`, `inset-inline-start: 0`,
existing purely to render the blockquote's own vertical depth indicator)
happens to sit at the line's true left edge, camouflaging **most, not
all**, of the gap. Zooming in 6× on a real, live selection over `> Quote`
as the boundary row shows a visible sliver of plain (non-selection)
background between the bar's right edge and where the purple selection
actually begins — the same defect, just mostly hidden behind an opaque
decoration that exists for an unrelated reason.

**There is nothing in the blockquote implementation to reuse.**

### Why we did not add custom CM6 selection rendering — INVESTIGATED + REJECTED

Researched directly against the installed `@codemirror/view` source for
an existing, supported mechanism:

- **`drawSelection(config)`**: its only configurable options are
  `cursorBlinkRate`, `drawRangeCursor`, `iosSelectionHandles`. Nothing
  controls rectangle geometry.
- **`Decoration.line`/`Decoration.mark`/`highlightStyle`**: confirmed
  (by reading `rectanglesForRange`'s own source) to never be read by the
  selection-rectangle computation at all — it only calls `coordsAtPos`/
  `bidiSpans`.
- **`EditorView.theme`**: can only restyle the CSS of the
  `.cm-selectionBackground` box CM6 already produces (color, opacity)
  — it cannot change that box's computed `left`/`width`, which are
  inline styles set directly by `RectangleMarker.adjust()`.
- **The one real, supported extension point**: `layer` and
  `RectangleMarker`, both public exports of `@codemirror/view` — the
  exact primitives `drawSelection()`'s own internals are built from. A
  small, additive `layer()` extension *could* draw a supplementary
  rectangle patching this gap on marker-line boundaries specifically,
  running alongside (not replacing) the default selection rendering.

**Decision: this was investigated and the custom-layer approach was not
built.** The gap is accepted as a cosmetic limitation rather than solved
with new CM6-rendering-layer code, because:

1. It is provably present in blockquote too (an existing, shipped
   construct), just harder to notice — this is not a bullet-specific
   defect requiring urgent correction.
2. Attempting to close it purely via marker CSS was shown to be
   mathematically impossible while also preserving the caret's own
   visual position (§4's `text-align: left` fix closes the gap but was
   itself found to create a caret/visual mismatch in an earlier
   iteration — see below) — any complete fix requires new, non-trivial
   CM6-rendering-layer code (the `layer()`/`RectangleMarker` approach),
   which was scoped out as disproportionate to a several-pixel cosmetic
   gap.

**One layer of this was actually fixed, separately**: `text-align` was
changed from `center` to `left` on `.cm-bullet-list-marker` specifically
to close this gap (§2/§3), and this **is** shipped and active — the real
(now-invisible) marker text lays out flush against the box's true left
edge, so `coordsAtPos`/selection agree with the box edge unconditionally
for the *painted* result. This works precisely because the real text is
already `color: transparent` for the `*→•` mechanism (§3) — its layout
position no longer needs to match anything visible. **This means the
selection gap described above, as measured against the ORIGINAL
`text-align: center` styling, is CURRENTLY RESOLVED for all three
bullet markers** — re-verified live: `Cmd+A` selection across `- Bullet`/
`* Bullet`/`+ Bullet` starts at exactly `337.828px` (the box's true left
edge) on every row, including boundary rows, at every font size tested.

**A separate, later attempt to also fix the underlying caret position**
(making `text-align: left` apply to real, *visible* — not
`*→•`-transparent — marker text, so no pseudo-element rendering trick
would be needed at all) was tried and reverted: it created a real
caret/Backspace mismatch (`-|Text` visually vs. the actual caret sitting
after the real separator) — see §4's own investigation of this exact
attempt. **The currently-shipped fix is therefore specifically "flush-left
layout + painted pseudo-element for the visible glyph," not "flush-left
literal text,"** and this is why the selection gap is resolved without
reintroducing that caret mismatch.

**Do not present this as an unresolved mystery**: the mechanism is fully
understood, the fix that was shippable without side effects is shipped,
and the residual "would need custom `layer()` code" case is a
deliberately-scoped-out, understood, accepted limitation — not an open
investigation.

---

## 6. Enter behavior

### Every Enter rule, current state

`markdownEnterCommand` (`markdownEnterKeymap.ts`) is the single Enter
binding, composed as a `||` chain, each handler narrowly gated and
falling through when its guard fails:

```ts
export const markdownEnterCommand: StateCommand = (target) =>
  exitEmptyBlockquoteContinuation(target) ||
  exitLazyContinuationBulletLookalike(target) ||
  preserveBulletMarkerOnContentStartSplit(target) ||
  continueFirstSameLineBulletLevel(target) ||
  continueMarkup(target) ||
  exitEmptyIndentContinuation(target);
```

This document covers the two handlers relevant to bullet lists:
`preserveBulletMarkerOnContentStartSplit` and
`continueFirstSameLineBulletLevel`. (`exitEmptyBlockquoteContinuation`,
`exitLazyContinuationBulletLookalike`, `exitEmptyIndentContinuation` are
blockquote/indentation-only-continuation concerns, out of this
document's scope, but visible in the same file.)

### Normal case — `- Text` + Enter

**IMPLEMENTED + VERIFIED.** `continueMarkup`
(`insertNewlineContinueMarkupCommand`, configured with
`nonTightLists: false`) handles this — no Clutter override needed.

```
"- Text" + Enter → "- Text\n- "
```

### Genuine multi-line nesting — `- Parent` / `  - Child` + Enter

**IMPLEMENTED + VERIFIED, unchanged by any bullet-specific work in this
document.** `continueMarkup`'s own `getContext` walk correctly finds
`Child`'s own `ListItem` as the innermost context and continues at
*that* level, not `Parent`'s shallower one:

```
"- Parent\n  - Child" + Enter → "- Parent\n  - Child\n  - "
```

### Same-line nested-list ambiguity — the bug this section exists for

**Why native `continueMarkup` follows the deepest `ListItem`**:
`getContext` (`@codemirror/lang-markdown`) walks `node.parent` from the
cursor all the way up, pushing **every** `ListItem`/`Blockquote`
ancestor regardless of which physical line it starts on — it has no
concept of physical lines at all, which is exactly correct for genuine
multi-line nesting (Parent/Child above). `insertNewlineContinueMarkupCommand`
then always uses `context[context.length - 1]` — literally "the last
(innermost) entry" — unconditionally.

For `"- - - - Text"`, this ancestor walk finds all **four** `ListItem`s
(§1's tree dump) on the identical physical line, and continues at the
deepest (4th) level — verified, before any fix, live:

```
"- - - - Text" + Enter → "- - - - Text\n      - "   (6-space indent + fresh marker)
```

**Why this conflicts with the rendering policy**: §7's rendering rule
visually collapses `"- - - - Text"` to `• - - - - Text` (one visible
marker). Enter's own mechanism has no knowledge of that rendering
decision at all (confirmed: `insertNewlineContinueMarkupCommand` never
reads decorations, only `state.doc`/`syntaxTree` — this file's own prior
doc comment already established this independently, before the
same-line rule existed). The decoration change didn't alter Enter's
behavior; it exposed a pre-existing mismatch between the visual model
(one marker) and the structural model (four levels) that Enter still
faithfully follows.

### The fix — `continueFirstSameLineBulletLevel`

```ts
const continueFirstSameLineBulletLevel: StateCommand = ({ state, dispatch }) => {
  const { selection } = state;
  if (selection.ranges.length !== 1 || !selection.main.empty) return false;

  const pos = selection.main.head;
  const line = state.doc.lineAt(pos);
  if (pos !== line.to) return false;                    // guard 2: end-of-line only

  const first = firstSameLineBulletMark(state, pos);
  if (!first) return false;                              // guard 3: real same-line collapse only

  const indent = state.sliceDoc(line.from, first.from);
  const markerAndSeparator = state.sliceDoc(first.from, first.to);
  const insert = state.lineBreak + indent + markerAndSeparator;

  dispatch(state.update({
    changes: { from: pos, to: pos, insert },
    selection: EditorSelection.cursor(pos + insert.length),
    scrollIntoView: true,
    userEvent: 'input',
  }));
  return true;
};
```

Guards, all required to fire: (1) single collapsed cursor; (2) cursor at
the exact end of the physical line; (3) `firstSameLineBulletMark` finds a
real same-line collapse (2+ same-line ancestors). When all three hold,
this is a **pure insertion** at the cursor — the original line is never
modified — of a newline, the first marker's own real leading indentation,
and a byte-for-byte copy of its own marker+separator text (whatever
width that separator actually is).

### Shared helper — why the logic must not be duplicated

`firstSameLineBulletMark(state, pos)`, exported from
`listMarkerDecoration.ts` and imported into `markdownEnterKeymap.ts`, is
the **same** "first `ListMark` per physical line" fact §7's rendering
rule establishes, queried for one position instead of accumulated across
a whole document rebuild. It reuses `isBulletListItemNode`/
`getBulletMarkRange` — the exact node-matching and range rules the
decoration itself uses — rather than re-deriving "what counts as a
bullet marker" a second time in the Enter file. This is deliberate: if
the rendering rule's definition of "first marker" ever changes, Enter's
behavior changes with it automatically, with no second place to update.

### Exact before/after (all live-verified, this session)

| Input | Before this fix | After this fix |
|---|---|---|
| `- Text` + Enter | `"- Text\n- "` | unchanged: `"- Text\n- "` |
| `- Parent`/`  - Child` + Enter | `"- Parent\n  - Child\n  - "` | unchanged |
| `- - Text` + Enter | `"- - Text\n  - "` (deepest level) | **`"- - Text\n- "`** (first level) |
| `- - - - Text` + Enter | `"- - - - Text\n      - "` (deepest level) | **`"- - - - Text\n- "`** (first level) |

Both resulting lines, after the fix, render with exactly one visible
marker each — a self-consistent visual model (verified via DOM
inspection immediately after each Enter press).

### Test coverage

**IMPLEMENTED + VERIFIED LIVE, but NOT YET covered by an automated
test.** `markdownEnterKeymap.test.ts` has no test for
`continueFirstSameLineBulletLevel` or the same-line-collapse scenario as
of this writing — the four before/after cases above were verified via
live browser interaction (real keystrokes, real DOM/`state.doc`
inspection), not via the test suite. Adding automated coverage for this
is a genuine, tracked gap — see §12/open questions.

---

## 7. Marker decoration policy — "first marker per physical line"

### The rule, stated precisely

> The first bullet `ListMark` encountered (in document order) on a given
> physical line is the visual list marker for that line. Any later
> `ListMark` whose own item starts on that **same** physical line remains
> ordinary, undecorated source text.

Implemented as a `Set<number>` of claimed `line.from` values,
accumulated fresh on every `buildDecorations()` call
(`listMarkerDecoration.ts`):

```ts
const seenLines = new Set<number>();
// ...
const lineFrom = view.state.doc.lineAt(range.from).from;
if (seenLines.has(lineFrom)) return;   // later same-line marker: skip
seenLines.add(lineFrom);
pending.push(range);
```

Tree iteration visits nodes in document order, and CM6/Lezer's pre-order
traversal visits an outer `ListItem` strictly before its nested child
(confirmed directly from the §1 tree dump: `ListMark[0,1)` before
`ListMark[2,3)` before `ListMark[4,5)` before `ListMark[6,7)`) — so
"first encountered per line" is automatically "outermost/leftmost," with
no extra sorting needed.

### Why this is a rendering/editor policy, not a parser rule

Restated from §1: the parse tree is not wrong and is not changed. All
four `ListMark`s in `"- - - - Text"` are real, independently valid nodes.
This rule only decides which of them gets a **decoration** — a purely
visual choice, reversible on every rebuild, with zero effect on
`state.doc` or the syntax tree.

### Why typing interception was rejected — INVESTIGATED + REJECTED

Two constraints proved to be in direct tension, not merely difficult to
satisfy together:

- Lezer's parser has no memory of keystroke order — it parses whatever
  `state.doc` currently contains. Given `"- - - - hey"` as a final
  document, four nested `BulletList`s is the *only* valid parse,
  regardless of whether that string was typed one key at a time, pasted,
  or loaded from disk.
- So "prevent the newly typed `- ` from becoming a nested list" can only
  mean: (a) change what actually lands in the document (a real source
  change, ruled out by requirement), or (b) leave the source exactly as
  typed, in which case the structural fact already exists before any
  interception logic could run — there is nothing left to intercept.

Even setting that aside, a per-keystroke interceptor **cannot see paste
or file-load**, which bypass per-keystroke handling entirely — the same
literal string would then render differently depending on whether it was
typed or pasted, a direct, visible violation of Clutter's own "Markdown
is the sole source of truth, rendering is a pure function of the parsed
tree" principle (already Locked elsewhere in this codebase before this
investigation).

### Why changing `state.doc` was rejected

Any fix that rewrites what a keystroke actually inserts (extra
characters, different characters, refusing the keystroke) is a real
source change by definition — explicitly out of scope per this
project's standing rule that Markdown source is canonical and rendering
never writes back to it except at well-defined, product-approved
insertion points (WikiLink autocomplete acceptance being the one
existing example elsewhere in this codebase, and even that only inserts,
never rewrites existing text).

### Why paste/load/reparse consistency matters

`buildDecorations()` recomputes `seenLines` fresh, from scratch, on
every call — there is no persisted state carried between rebuilds, and
no notion anywhere in the mechanism of "was this typed, pasted, or
loaded." Verified directly: typing `"- - - - - - - - - - hey"` (10
repeats) live produces the identical single-marker rendering as any
other same-line-collapsed input, and a fresh page reload (a genuine
"loaded from scratch" `buildDecorations` call, not a continuation of any
typing session) was confirmed architecturally to produce the same result
by the same reasoning — `buildDecorations` has no code path that could
behave differently based on how the current document state was reached.

### Why decoration-level suppression is deterministic and source-preserving

Because it depends only on two things, both purely functions of the
*current* document state: the current syntax tree (Lezer's own, already
re-parsed on every edit) and physical line boundaries (`state.doc.lineAt`).
Neither depends on typing history, so the same document always renders
the same way, satisfying the parser-driven-rendering principle this
codebase already treats as Locked elsewhere ("the renderer must never
infer 'this looks like a bullet' from raw text").

### Verified live (this session)

| Input | `state.doc` (unchanged) | Marker count rendered |
|---|---|---|
| `- - hey` | `"- - hey"` | 1 |
| `- - - hey` | `"- - - hey"` | 1 |
| `- - - - hey` | `"- - - - hey"` | 1 |
| `- - - - - hey` (5×) | `"- - - - - hey"` | 1 |
| `- - - - - - - - - - hey` (10×) | `"- - - - - - - - - - hey"` | 1 |
| `- Parent` / `  - Child` (different lines) | unchanged | 2 — both render normally |
| `- Text`, `+ Text`, `* Text` (normal, single-level) | unchanged | each renders its own marker |
| 10 bare `- ` with no trailing text | unchanged | **0** — parses as `HorizontalRule` (§1's thematic-break ambiguity, not caused by this rule) |

Ordinary editing on the now-undecorated later `- ` runs was also directly
verified unaffected: `ArrowRight` steps one character at a time through
them, `Shift+ArrowRight` selects real text there, and Backspace-on-
selection deletes normally — all exactly as on any ordinary plain text,
because it *is* ordinary, undecorated text with no special handling
attached.

### Test coverage

**IMPLEMENTED + VERIFIED LIVE, but NOT YET covered by an automated
test** — same gap noted in §6. `listMarkerDecoration.test.ts` has no
test asserting the same-line-suppression behavior as of this writing.

---

## 8. Backspace / Delete

### Current Backspace binding

```ts
{
  key: 'Backspace',
  run: (target) => deleteBulletMarkerSeparator(target) || deleteMarkupBackward(target),
}
```

`deleteBulletMarkerSeparator` (Clutter's own override) runs first;
`deleteMarkupBackward` (`@codemirror/lang-markdown`'s own command) is the
fallback for every case Clutter's override declines.

### `deleteBulletMarkerSeparator` — what it does, exactly

**Two shapes, both source-local, both resolved purely from the current
tree/cursor position** — never from what command last ran:

- **Non-empty item** (`- |Text`, real content follows the marker):
  removes **only the separator whitespace**, leaving the marker intact —
  `- |Text` → `-|Text`. Applies regardless of separator width
  (`-   |Text` collapses to `-|Text` in **one** press, not one per
  space) and regardless of list position (first/later/nested/grandchild
  all identical).
- **Empty item** (`- |` — nothing at all follows the marker+separator on
  that physical line): removes the **marker and separator together, in
  one press** — `- |` → `|` (a genuinely blank line), rather than
  leaving a bare marker behind.

### Why the empty-item case removes marker+separator together — locked product decision (2026-08-28)

A bare marker (`-`, no separator) is rendered by `listMarkerDecoration.ts`
as **completely undecorated** (§1's bare-marker gate — `getBulletMarkRange`
returns `null` until a real separator exists). This means a bare-marker
end state would be visually indistinguishable from "nothing happened
yet" if Backspace only removed the separator on an empty item — so the
empty case removes the whole construct instead, on the general principle
"never leave state on screen that looks identical to a different,
unintended state."

### Precise boundary distinctions (do not conflate these)

| Position | Example | Backspace result |
|---|---|---|
| Before the marker | `\|- Text` | **Declines** — falls through to `deleteMarkupBackward`/default char deletion |
| Immediately after the marker, before any separator | `-\| Text` | **Declines** — this is mid-marker/pre-separator, not the boundary this override targets |
| Mid-separator (3-space separator, caret after the first space) | `- \| _Text` | **Declines** |
| **Content-start** (the marker+separator boundary, real content follows) | `- \|Text` | **Fires** — separator removed, marker kept: `-\|Text` |
| **Empty item** (marker+separator boundary, nothing follows on the line) | `- \|` | **Fires** — marker+separator removed together: `\|` |
| Inside content | `- Te\|xt` | **Declines** — generic character deletion, not this override |
| End of content | `- Text\|` | **Declines** |
| First item | `- \|Text` (only item) | Identical rule to any other position — no first-item special case |
| Later item | `- One\n- \|Two` | Identical rule — `- One\n-\|Two` |
| Nested item | `- Parent\n  - \|Child` | Identical rule, leading indentation before the marker untouched — `- Parent\n  -\|Child` |
| Non-empty selection overlapping marker/content | any | **Declines** — this is a single-cursor-only rule; any selection falls through |

### Ordered vs. bullet symmetry — explicitly NOT symmetric

`deleteBulletMarkerSeparator` **excludes ordered lists** (`1.`/`1)`)
entirely — `1. |Text` and `10. |Text` are untouched by this override and
keep CM6's own unmodified `deleteMarkupBackward` behavior. This is a
**deliberate, not-yet-made** product decision, not an oversight: bullets
got this treatment first; ordered lists' own Backspace policy (including
whether renumbering should happen) is open, tracked in §12.

### Parser verification of the resulting document

Confirmed directly (not assumed) that the results above are not merely
visually right but structurally correct: `"-Text"` (post-Backspace, non-
empty case) has **no `ListMark`/`ListItem` at all** — CommonMark requires
at least one separator space after a bullet marker with content
following it, so the result is a plain `Paragraph`. A later item's
Backspace-to-empty-separator collapses into **lazy-continuation text of
the previous paragraph**; a nested item's equivalent collapses into the
**parent's own lazy-continuation paragraph**. No rendering-side
compensation is needed for any of this: bullet rendering is keyed
entirely off the parser's own `ListMark` node, so it stops being drawn
the instant the parser stops emitting one, with zero special-casing.

### Interaction with Tab (independence confirmed)

Backspace reads the **current** tree at the time it runs, independent of
Tab's own edit history. Verified: `"- Text"`, Tab (shifts the marker
right), then Backspace at the now-shifted boundary applies the identical
rule; `"- Parent\n  - Child"`, Tab on `Parent` only, then Backspace at
`Child`'s own boundary is unaffected by `Parent`'s unrelated Tab.

### Interaction with Enter (independence confirmed)

`"* Text"`, Enter, then exactly **one** Backspace on the freshly-created
empty item removes precisely what Enter added (marker+separator gone,
the line break Enter inserted untouched) — returns to `"* Text\n"`, not
further. The same result is reached whether the empty item was typed by
hand or created by Enter — **no hidden "was this created by Enter" state
exists anywhere**; both paths read the identical, current tree.

### Delete (forward) — ACCEPTED LIMITATION, deferred, not this session's scope

`Delete`'s current behavior at a marker boundary is CM6's plain
`deleteCharForward`, with **zero Markdown awareness** — it can produce an
orphaned leading space with no marker (e.g. `"- |Text"` → Delete →
`" Text"`). This was identified and explicitly deferred in an earlier
phase of this project (recorded in the standing project memory this
document consolidates, not re-litigated here) as its own, narrowly-
scoped future phase — not addressed by any change in this document.
**NOT YET INVESTIGATED further this session.**

### Test coverage

**IMPLEMENTED + VERIFIED, WITH automated test coverage** —
`markdownBulletBackspace.test.ts` covers all of the above (basic four
scenarios, separator-width variants 1–4 spaces, non-boundary declines,
selection declines, ordered-list exclusion, empty-item removal for every
marker character, task-list checkbox boundary, parser-verification of
results, Tab interaction, Enter interaction) — this is the
best-automated-tested piece of bullet-list behavior in this document.

---

## 9. Tab / Shift-Tab

### Final decision: uniform per-line indentation, no construct awareness

**Current, shipped behavior** (`markdownIndentKeymap.ts`, commit
`20ff06a5` "simplify Tab/Shift-Tab to uniform per-line indent with a
5-level ceiling"): every physical document line touched by the selection
gets the same `INDENT_STEP_SPACES` (2) added to (Tab) or removed from
(Shift-Tab) its own leading whitespace, **independently of every other
line and regardless of what construct it is** — no paragraph/list/
heading/blockquote/code distinction, no syntax-tree lookup, no
parser-hierarchy preservation, no reparse/validation step.

```ts
function lineIndentChange(line: Line, direction: 1 | -1): ChangeSpec | null {
  const leadingEnd = line.from + /^[ \t]*/.exec(line.text)![0].length;
  const current = leadingEnd - line.from;
  const target = direction === 1
    ? Math.max(current, Math.min(current + INDENT_STEP_SPACES, MAX_INDENT_SPACES))
    : Math.max(0, current - INDENT_STEP_SPACES);
  if (target === current) return null;
  return { from: line.from, to: leadingEnd, insert: ' '.repeat(target) };
}
```

Tab is capped at `MAX_INDENT_LEVELS = 5` (10 spaces) — a flat, per-line
ceiling, not a parser/hierarchy concept: a line already at or past the
ceiling simply produces no further change on Tab. **A line manually
indented past the ceiling (pasted/typed, not reached via Tab) is never
shrunk by pressing Tab — only prevented from growing further** (confirmed
by `Math.max(current, ...)` in the growth branch). Shift-Tab is never
capped — a line indented deeper than the ceiling by any means can still
be dedented all the way to 0.

### What the earlier, construct-aware version (`markdownIndentContext.ts`) actually provided — INVESTIGATED + REJECTED (superseded)

An earlier implementation (`resolveLineIndentContext`/`computeIndentChange`
in `markdownIndentContext.ts`, still present in the file but **no longer
called by `markdownIndentKeymap.ts`** — confirmed by grep: the only
remaining callers of `resolveLineIndentContext` are two Enter-keymap
handlers, unrelated to Tab) classified each line as `paragraph`/`list`/
`heading`/`code`/`unhandled` and computed indentation relative to a
list's own marker position specifically for `list`-classified lines.

**Investigation finding that led to simplification**: this
construct-aware version produced **byte-identical results to plain CM6
`indentMore`/`indentLess`** in every tested case *except* two narrow,
cosmetic ones (skipping non-list/paragraph lines in a mixed selection,
and skipping blank lines) — and a genuinely stronger guarantee
("indenting list lines without ever letting the parser
reclassify/reparent them") was found to be **not achievable at all**
while staying valid CommonMark, because indentation depth *is* what
determines list nesting in CommonMark — there is no way to change a
line's leading whitespace without it potentially being reparsed into a
different structural position on the next parse. Given that, the extra
construct-detection machinery bought nothing durable, and was removed
from the Tab/Shift-Tab path (kept, unused for this purpose, only because
`resolveLineIndentContext` itself is still needed by unrelated Enter
handlers).

### The conclusion this document must preserve verbatim

**Indentation is derived from the resulting Markdown/source on the next
reparse — never from which keyboard action produced it, and never
protected/preserved by Tab/Shift-Tab itself.** A line's list nesting
after a Tab press is whatever CommonMark says a line at that exact
column, in that exact document context, structurally is — not whatever
level Tab "intended." This is the same principle §1/§7 establish for
same-line marker collapsing, applied to indentation instead of marker
count: Clutter's editing commands write plain text; the parser alone
decides what that text structurally means, on every keystroke, with zero
exceptions.

### Exact tested cases (from `markdownIndentKeymap.test.ts`, all passing)

- **Single selected bullet**: Tab/Shift-Tab on one item does not affect
  siblings, parent, or children — verified for parent-only, single
  sibling among three (`- A`/`- B`/`- C`, Tab on `B` only), and
  isolated/parentless items.
- **Multiple selected bullets (multi-line selection)**: every explicitly
  selected line is indented — this is deliberately **not** "move this
  subtree," confirmed distinctly: a selection spanning `Parent`+`Child`
  indents both, because both are explicitly selected, not because one is
  structurally nested under the other.
- **Repeated Tab**: progression `0,2,4,6,8,10`, then plateaus at the
  5-level ceiling — for both paragraphs and list items identically.
- **Repeated Shift-Tab**: progression `10 → 0`, then floors at 0 — no
  construct distinction.
- **Mixed selections**: a selection touching a list line and a
  blockquote line indents both uniformly — "no construct distinction" is
  a tested guarantee, not an assumption.
- **Blank lines**: a genuinely blank line inside a selection is indented
  too, matching native CM6 — not skipped.
- **Caret-column independence**: Tab/Shift-Tab indent the item from its
  own marker position regardless of where the caret sits inside that
  line (tested across five caret positions per item, both directions) —
  a locked-down matrix in the test file.
- **No preceding sibling required**: an isolated bullet with no
  structural parent anywhere indents independently, level by level,
  confirmed to remain a valid, independently-addressable `ListItem` after
  each press (reparsed, not assumed).
- **Undo/redo**: each Tab press is exactly one transaction — real CM6
  history, no custom history code; three Tabs then three Undos restores
  progressively, Redo replays each step.
- **Tab → Enter**: Tab on `Parent`, then Enter at end of `Parent` —
  the new sibling line appears at the post-Tab column, with **no**
  Enter-specific change needed (Enter simply reads whatever tree Tab's
  edit produced).

### Current actual state: `#1` is enabled, in its simplified (uniform, non-construct-aware) form

To directly answer the phrasing in the request: the "dedicated list
indentation behavior" (`markdownIndentContext.ts`'s construct-aware
classification) was **investigated, found to add no durable guarantee
over plain per-line indentation, and removed from the Tab/Shift-Tab code
path** — `markdownIndentKeymap()` (currently enabled) uses only the
simple, uniform `lineIndentChange` described above. `resolveLineIndentContext`
itself was **not deleted** — it remains in active use by two Backspace/
Enter-adjacent handlers (§6, §8) that have a genuinely different need
(classifying one specific line for a narrow guard, not indenting a whole
selection).

---

## 10. Other keyboard interactions — ODR matrix

Legend: **✓ tested** (this document's own investigation or an existing
automated test) / **NOT TESTED** (explicitly not verified — do not infer
behavior from adjacent rows).

| Key | Before marker | Inside marker | After marker/separator (content-start) | Mid-content | End-of-line | Empty item | First item | Later item | Genuine nested item (different line) | Same-line nested ambiguity | Selection |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Enter** | NOT TESTED | NOT TESTED | ✓ preserves marker+separator on original line, splits correctly (`preserveBulletMarkerOnContentStartSplit`, §6/test suite) | ✓ ordinary split via `continueMarkup` (upstream, untested by name here but exercised by adjacent cases) | ✓ `- Text` → `"- Text\n- "` (§6) | ✓ empty item + Enter is `continueMarkup`'s own "exit the list" gesture, unwinds one level (`markdownEnterKeymap.test.ts`) | ✓ (§6 table) | ✓ (§6 table) | ✓ continues at genuine child level (§6) | ✓ **fixed**: continues at first same-line level (§6) | NOT TESTED (multi-range Enter) |
| **Backspace** | ✓ declines, falls through (§8 table) | ✓ declines (§8 table) | ✓ removes separator only, keeps marker (§8) | ✓ declines, ordinary char deletion (§8) | ✓ declines (§8) | ✓ removes marker+separator together (§8, locked decision) | ✓ identical rule to any position (§8) | ✓ identical rule (§8) | ✓ identical rule, leading indentation untouched (§8) | NOT TESTED (Backspace at a same-line-collapsed later marker specifically — §8's rule is position-based and would presumably decline the same way it does for a genuine later item, since the same-line collapse doesn't change tree structure, but this exact combination was not separately exercised) | ✓ non-empty selection always declines, falls through to CM6 (§8) |
| **Delete (forward)** | NOT TESTED | NOT TESTED | ACCEPTED LIMITATION — plain `deleteCharForward`, zero Markdown awareness, can orphan a leading space (§8) | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| **Tab** | N/A (whole-line operation) | N/A | N/A | N/A | N/A | ✓ indents the line like any other (uniform rule, §9) | ✓ (§9) | ✓ (§9, sibling-independence tested) | ✓ (§9, Parent/Child independence tested) | NOT TESTED explicitly for a same-line-collapsed line (the uniform per-line rule would indent the whole physical line's leading whitespace regardless, per §9's own "no construct distinction" design, but this exact input was not separately exercised) | ✓ multi-line selection indents every explicitly selected line (§9) |
| **Shift-Tab** | N/A | N/A | N/A | N/A | N/A | ✓ (§9, floors at 0) | ✓ (§9) | ✓ (§9) | ✓ (§9) | NOT TESTED (same caveat as Tab above) | ✓ (§9) |
| **ArrowLeft** | NOT TESTED | ✓ steps one character at a time, ordinary text behavior (`listMarkerDecoration.ts`'s own probe verification, §2) | ✓ lands caret correctly, touching following content (§4 — this is the direction that was already correct before the `assoc` fix) | ✓ ordinary | NOT TESTED | N/A | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED (multi-range) |
| **ArrowRight** | NOT TESTED | ✓ steps one character at a time (§2, §3) | ✓ **fixed** by `listMarkerCaretAssoc` — previously showed a visual gap, now touches content correctly (§4) | ✓ ordinary | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| **ArrowUp** | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| **ArrowDown** | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| **Home** | ✓ used throughout this session's own test setup to reach true line-start reliably (behavior itself not the subject of investigation) | N/A | N/A | N/A | N/A | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| **End** | N/A | N/A | N/A | N/A | ✓ used throughout this session to reach end-of-line reliably (behavior itself not the subject of investigation) | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |

**Read this matrix literally.** A cell marked ✓ means the specific
combination named in this document was actually observed (live or via an
existing automated test) — not that "the row/column generally works."
Every `NOT TESTED` cell is a genuine gap, not an inferred pass.

---

## 11. Mixed / sequence cases

All of the following were directly observed this session (live browser
interaction, `state.doc`/DOM inspected after each step) unless marked
otherwise.

### marker → Enter → Backspace

```
"* Text" --(Enter)--> "* Text\n* " --(Backspace)--> "* Text\n"
```
One Backspace on the freshly-created empty item removes exactly what
Enter added (marker+separator), leaving the line break Enter inserted
untouched. ✓ (§8, automated test coverage in `markdownBulletBackspace.test.ts`)

### marker → Enter → Enter

**NOT TESTED explicitly as a named sequence in this document.** Expected
behavior, by composing already-verified single-step rules: first Enter
continues the list (empty item created); second Enter on that still-empty
item should trigger `continueMarkup`'s own "empty line in list" branch
(unwind one structural level) — this is `continueMarkup`'s
own upstream behavior, exercised in `markdownEnterKeymap.test.ts`'s
"empty list continuation removes one structural level" suite, but the
exact two-Enter-presses-in-a-row sequence starting from a bullet was not
independently re-verified in this investigation. **Do not treat this as
confirmed beyond what the cited single-step tests establish.**

### marker → Tab → Enter

```
"- Text" --(Tab)--> "  - Text" --(Enter at end)--> "  - Text\n  - "
```
✓ Tested directly (`markdownIndentKeymap.test.ts`, "Tab → Enter: Enter
reads the tree Tab produced, with no Enter-specific changes needed") —
the new sibling line appears at the post-Tab column with zero
Enter-specific code needed; Enter simply reads whatever tree Tab's edit
produced.

### nested marker → Shift+Tab → Enter

**NOT TESTED as a named sequence.** `markdownIndentKeymap.test.ts` tests
Shift-Tab's dedent behavior on nested items extensively (§9), and Enter's
behavior after arbitrary tree states is established to be purely
tree-driven (no Enter-specific state), but this exact
nested-then-dedent-then-Enter sequence was not independently exercised.
Expected, by composition, to behave like "Enter reads the tree
Shift-Tab produced" (mirroring the Tab→Enter case above), but this is an
inference from adjacent verified facts, not a direct observation —
flagged here rather than silently assumed.

### same-line nested text → Enter → Backspace

```
"- - - - Text" --(Enter)--> "- - - - Text\n- " --(Backspace at content-start of new line)--> ?
```
**NOT TESTED as a full sequence.** The Enter step is fully verified
(§6). The follow-on Backspace step would land at the new line's own
content-start (`"- |"`, an empty item — per §8's rule this should remove
marker+separator together, producing `"- - - - Text\n"`), but this exact
continuation was not independently re-run and confirmed in this
investigation. Treat as a strong inference from §6+§8's independently
verified rules, not a directly observed result.

### cursor moving left/right through marker + separator

```
"- Text", Home, ArrowRight×2 (0→1→2) reaches content-start;
ArrowLeft×2 returns to 0 — byte-identical single-character steps each way.
```
✓ Directly verified, multiple times, across `-`/`+`/`*` markers and at
different font sizes (§2, §3, §4).

### selection across marker + content

```
"* Bullet", Home, Shift+End → selects the literal "* Bullet" (real
asterisk, not the painted dot) — non-zero selection-background rectangle.
```
✓ Directly verified (§3).

---

## 12. Guide for future list types

### What is genuinely shared (safe to reuse as-is)

- **`Decoration.mark` over real source text, never `Decoration.replace`/
  widgets, for markers that are never clicked and have exactly one
  rendered form.** This is the single strongest, most repeatedly
  re-confirmed lesson in this entire document (§2) — every attempt to
  use a replaced/hidden-source range for an ordinary marker hit the same
  zero-width hit-testing ambiguity, independently, twice (once for the
  original bullet widget, once considered again for `*→•` before
  settling on the pseudo-element approach).
- **The 20px marker-column model** (`--marker-width`, `display:
  inline-block`, `width: var(--marker-width)`) — construct-agnostic,
  already shared with blockquote's own marker.
- **"First `ListMark` per physical line is the real marker; render/Enter
  policy, never a parser change" (§7)** — the same same-line-empty-item
  CommonMark ambiguity exists identically for ordered lists (`1. 1. 1.
  Text` is exactly as valid and exactly as nested, by the same
  CommonMark rule). The `firstSameLineBulletMark`-style helper's *shape*
  (walk ancestors, filter to same physical line, take the smallest
  `.from`) generalizes directly — only the node-matching predicate
  (`isBulletListItemNode`/`getBulletMarkRange`'s character-set check)
  needs a parallel ordered-list version.
- **The `continueFirstSameLineBulletLevel`-style Enter override
  shape**: guard on (single cursor, end-of-line, same-line collapse
  detected), then insert `newline + indent + first-marker-verbatim` —
  reusable as a pattern for any future list kind with the identical
  same-line ambiguity.
- **`deleteBulletMarkerSeparator`'s two-shape rule** (separator-only for
  non-empty items, marker+separator-together for empty items) is a
  general "don't leave visually-ambiguous state" principle, not
  bullet-specific in its reasoning — worth re-deriving for ordered lists
  once their own rendering exists, but **not silently assumed to
  transfer** (see below).
- **Tab/Shift-Tab's uniform, construct-agnostic per-line indentation**
  (§9) already applies to every line regardless of construct, ordered
  lists included, today — no future work needed there specifically for
  ordered lists' *indentation*.

### What is bullet-specific (do not silently generalize)

- **The exact `*→•` glyph-substitution mechanism and its per-glyph
  `left`/`bottom` tuning constants (§3)** are tuned to `-`/`+`/`*`'s own
  specific glyph metrics in the current UI font — an ordered marker's
  numeral has entirely different, variable-width metrics (`1.` vs.
  `10.` vs. `100.`) and needs its own measurement pass, not inherited
  values.
- **`BULLET_MARKER_CHARACTERS = new Set(['-', '*', '+'])`** and every
  function gated on it (`getBulletMarkRange`, `firstSameLineBulletMark`,
  `deleteBulletMarkerSeparator`, `continueFirstSameLineBulletLevel`) are
  explicitly bullet-only by construction — ordered lists are currently
  **excluded** from all of them (confirmed: `deleteBulletMarkerSeparator`
  explicitly declines for `1.`/`1)`, keeping unmodified upstream
  behavior — §8).
- **`ListBulletWidget`'s retirement (§2)** is a decision about *this*
  construct's chosen final architecture, not a blanket ban on widgets
  everywhere — task checkboxes (below) are a case where a real,
  clickable widget may be the *correct* choice, for reasons bullets
  never had (bullets are never interactive).

### For ordered lists — the expected 20px marker-column model

Per the earlier architectural investigation this document consolidates:
minimum width `20px` (same `--marker-width` token), **growing naturally**
for wider numerals (`1.` vs. `10.` vs. `100.`) via `min-width` rather
than bullets' fixed `width` — `min-width` is a floor, so `100.` simply
expands the box past 20px with zero JS measurement needed, while `1.`
sits exactly at the 20px floor like a bullet does. This was proposed and
reasoned through in an earlier phase of this project's history but
**has not been implemented or visually verified** — treat "min-width:
20px, grows naturally" as the carried-forward design intent, not as a
tested fact.

### For task lists — architectural questions, explicitly not answered here

The following remain **NOT YET INVESTIGATED** for this document's
purposes, and must not be assumed from the bullet work above:

- **Source-preserving Markdown**: `- [ ] Text`/`- [x] Text` must stay
  literal in `state.doc`, per the same non-negotiable principle
  governing every construct in this document — not in question, but
  *how* a checkbox widget composes with that principle (below) is.
- **Checkbox rendering — widget vs. mark**: unlike `-`/`+`/`*`, a
  checkbox is a genuinely interactive control with two discrete visual
  states that must be *clicked*, not *typed into* — a categorically
  different requirement from any bullet marker, which is never clicked.
  A prior, now-deleted prototype (`TaskCheckboxWidget.ts`, git history
  only, not in the current tree) built exactly this — a real
  `Decoration.replace`+`WidgetType` checkbox over just the 3-character
  `[ ]`/`[x]` `TaskMarker` node (not the whole `- [ ] ` prefix), atomic
  at rest, reveal-on-engagement, built on the same generic
  `semanticToken`-family mechanism as WikiLink/Tag/Date. It was removed
  in an unrelated broad reset, **not because it failed** — no defect was
  ever recorded against it. This document does not re-litigate or
  re-verify that prototype's correctness; it is recorded here as prior
  art to re-examine, not as a settled conclusion.
- **Whether/when source is concealed**: the bullet-marker lesson (§2) —
  that concealing/replacing an ordinary, non-interactive marker causes
  hit-testing defects — does **not** automatically transfer to a
  genuinely interactive checkbox, which has different requirements
  (click target size, checked/unchecked visual states) a plain
  `Decoration.mark` cannot satisfy at all. Whether task checkboxes should
  follow bullets' "never replace" rule or WikiLink's "replace at rest,
  reveal on engagement" rule is a **live, unresolved architectural
  question**, not decided by this document.
- **Cursor engagement / atomic behavior**: whether a task checkbox
  should be `atomicRanges`-atomic at rest (like WikiLink/Tag/Date) is
  unresolved and untested for this specific construct as of this
  document.

**Do not implement task-list rendering by assuming any specific answer
to the above** — they are open questions to investigate fresh, using
this document's own methodology (trace the real parser tree, verify
live in the running app, measure geometry directly, compare
alternatives before choosing) rather than by analogy alone.

---

## 13. Ordered lists — implementation, verified behavior, decisions (2026-08-29)

This section records the full investigation and implementation that
extended §1–§12's bullet-only architecture to also cover ordered list
items (`1.`, `1)`, ...), per the workflow §12 itself prescribed:
investigate the parser first, identify exactly what the bullet
architecture shares, propose the smallest change, implement, test, and
verify live — never assume transfer.

### 13.1 Parser investigation (done first, per the ODR's own required
workflow)

Verified directly against the installed `@lezer/markdown` grammar (a
throwaway script using the exact `markdown({ addKeymap: false })` config,
mirroring §1's own methodology):

- **Node shape**: identical to bullets — `ListItem`'s `firstChild` is
  always `ListMark`, whether the item is bullet or ordered. `"1. A\n2.
  B\n3. C"` parses as one `OrderedList` containing three `ListItem`s, each
  with its own `ListMark` (`"1."`, `"2."`, `"3."`) and `Paragraph`.
- **No parser-level renumbering, ever**: `"5. A\n5. B\n5. C"` (repeated
  number) parses as three ordinary sibling `ListItem`s with `ListMark`
  text `"5."` each — the parser never rewrites, validates, or normalizes
  the literal digits. This is the same "Markdown source is the sole
  canonical source of truth, the parser never rewrites what it reads"
  principle §1 already established for bullets, confirmed to hold
  identically for ordered markers.
- **CommonMark's own start-number limit**: 1–9 digits. A 10th digit
  (`"1234567890. Text"`) does not parse as a list at all — confirmed
  directly, falls back to a plain `Paragraph`. `ORDERED_MARKER_PATTERN =
  /^\d{1,9}[.)]$/` in `listMarkerDecoration.ts` encodes this limit exactly,
  not an arbitrary cap.
- **Two independent delimiter styles, `.` and `)`**, each a complete,
  valid ordered marker (`"1."`/`"1)"`) — both handled uniformly by the
  same regex and the same rendering/Enter/Backspace code, no special-
  casing needed anywhere.
- **Changing delimiter style starts a new list**: `"1. A\n2) B"` parses as
  **two separate** `OrderedList`s (confirmed directly), not one list with
  mixed delimiters — a CommonMark rule, not a Clutter decision, and not
  specifically tested further since nothing in this codebase's rendering
  or editing code depends on "is this the same list as the previous
  line," only on the current line's own `ListItem`/`ListMark`.
- **Same-line collapse ambiguity reproduces identically for ordered
  markers**: `"1. 1. 1. Text"` parses as three levels of nested
  `OrderedList`, all on one physical line — the exact same CommonMark
  empty-item-whose-content-is-another-list mechanism §1 documented for
  bullets, confirmed with a fresh tree dump, not assumed by analogy.
- **The ambiguity also crosses marker kinds** — this was the one
  genuinely new, shared architectural issue this investigation surfaced
  (see §13.3): `"- 1. Text"` parses as `BulletList > ListItem > OrderedList
  > ListItem > Paragraph`, all one physical line; `"1. - Text"` and `"1. -
  1. Text"` are the symmetric and three-deep mixed-kind cases, confirmed
  the same way.
- **Ordered task-list items parse identically to bullet task-list
  items**: `TaskList` (the GFM extension already enabled at the grammar
  level, per `markdownGrammarExtensions.ts`) applies to ordered items too
  — `"1. [ ] task"` produces a `Task`/`TaskMarker` child exactly like `"-
  [ ] task"`, confirmed directly (the grammar config used in this probe
  included `TaskList`, unlike the bare `markdown()` config used for the
  other probes above, which silently omits it and would otherwise
  misleadingly show `[ ] task` as plain paragraph text).
- **Upstream CM6 auto-increments end-of-line continuation, for free**:
  `insertNewlineContinueMarkupCommand` (`@codemirror/lang-markdown`,
  already wired as `continueMarkup` — see §6) computes a *new* line's
  ordered marker as "the immediately preceding item's own literal number,
  plus one" — confirmed directly: `"5. A\n5. B"` + Enter (at end of `B`)
  produces `"5. A\n5. B\n6. "`, not `"5. A\n5. B\n3. "` (item count) and
  not `"5. A\n5. B\n5. "` (verbatim repeat). This is entirely upstream,
  untouched by any code in this document, and resolves the numbering
  question raised by the original request for the one case it applies to
  (see §13.6 for the full numbering-policy answer, including the case
  where this does **not** apply).

### 13.2 What was genuinely shared vs. what needed its own logic

Confirming §12's own predictions, checked one at a time rather than
assumed:

- **`Decoration.mark` over real source text — reused as-is**, and *more*
  simply than bullets: ordered markers need no glyph substitution at all
  (no `*→•`-style pseudo-element, no `color: transparent` layering — see
  §13.4), so ordered rendering is architecturally simpler than bullets',
  not merely parallel to it.
- **The 20px marker-column model — reused, with one deliberate
  deviation**: `min-width` instead of bullets' fixed `width`, exactly the
  carried-forward design intent §12 recorded (now implemented and
  verified — see §13.4).
- **"First `ListMark` per physical line" — reused, but required
  generalizing the mechanism itself, not just adding a parallel
  predicate.** §12 predicted only the node-matching predicate would need
  a parallel version; the investigation in §13.1 found something
  stronger was actually required — see §13.3.
- **`continueFirstSameLineBulletLevel`'s shape — reused verbatim, zero
  logic changes.** The function's own body never referenced bullet-
  specific state; it only sliced whatever text `firstSameLineBulletMark`
  (now `firstSameLineListMark`) returned. Generalizing the query function
  it calls was sufficient — renamed to `continueFirstSameLineListLevel`
  for clarity, but its internals are byte-identical to the pre-extension
  version.
- **`deleteBulletMarkerSeparator`'s two-shape rule — reused, extended by
  relaxing one guard.** §12 flagged this as "worth re-deriving, not
  silently assumed to transfer." Re-derivation concluded the reasoning is
  not bullet-specific (see §13.5) — the fix was widening the `BulletList`-
  only parent check to accept `OrderedList` too, not rewriting the rule.
- **Tab/Shift-Tab (§9) — needed no change at all**, confirmed by re-
  reading `markdownIndentContext.ts`'s `resolveLineIndentContext`: its
  `'list'` classification already keys off any `ListItem`/`ListMark` pair,
  with no bullet-specific character check anywhere in that file. This was
  already true before this session — §12's claim was correct without
  any code change needed.
- **`exitLazyContinuationBulletLookalike`'s fallback shape — reused,
  extended by widening its regex.** Not explicitly named in §12's
  predictions (§12 predates this fallback's own documentation being this
  thorough), but investigated fresh here: the root cause (a line indented
  4+ columns past the nearest open block's own content column becomes
  lazy-continuation text) is a generic CommonMark indentation rule, not
  keyed to which marker character starts the line — confirmed live (see
  §13.7) that `"1. Parent\n        1. Child"` reproduces the identical
  lazy-continuation shape bullets have, and the existing fallback now
  handles it once its lookalike regex accepts ordered markers too.

### 13.3 The shared architectural issue: same-line collapse crosses marker kinds

This is the one finding in §13.1 that could not be handled by adding a
parallel, independently-scoped ordered version of the bullet mechanism —
doing so would have reintroduced a real, visible bug.

**The problem, concretely**: `listMarkerDecoration.ts`'s `seenLines`
dedup (§7) is what implements "only the first `ListMark` per physical
line gets a marker decoration." Before this session, it existed once, in
one `ViewPlugin`, scoped to bullets only. Had ordered-list rendering been
added as a **second**, independent `ViewPlugin` with its **own**
`seenLines` set (the naive "parallel predicate" reading of §12's own
prediction), a mixed-kind same-line-collapsed line like `"- 1. Text"`
would have been decorated by **both** plugins — the bullet plugin
decorating `"-"` (the first bullet `ListMark` it sees) and the ordered
plugin decorating `"1."` (the first ordered `ListMark` *it* sees,
independently) — rendering **two** visible markers where the policy
established in §7 calls for exactly one.

**The fix**: `buildDecorations()` in `listMarkerDecoration.ts` is one
function, one tree walk, one `seenLines` set, shared by both kinds — see
that file's own top doc comment and the doc comment directly above
`buildDecorations` for the full mechanism. Tree pre-order visits an outer
`ListItem` before its nested child regardless of which kind either one
is (the same fact §7 already established for same-kind chains), so
"first encountered per line, across both kinds" is automatically
"outermost/leftmost" with no extra sorting — verified live and by
automated test (§13.8) for `"- 1. Text"` (bullet wins, exactly one bullet
marker rendered, zero ordered markers), `"1. - Text"` (ordered wins,
symmetric), and `"1. - 1. Text"` (three-deep, ordered still wins as the
outermost).

`firstSameLineListMark` (the generalized, exported query function `Enter`
consumes — formerly `firstSameLineBulletMark`) needed the identical
treatment for the same reason: it now walks and collects *both* kinds of
`ListMark` ancestor and returns whichever starts first, so
`continueFirstSameLineListLevel` continues the correct (outermost) marker
of a mixed-kind chain on Enter, not just a same-kind one.

**This is the "genuinely shared architectural issue" this document's own
task brief asked to be investigated before touching bullet behavior.**
Resolving it did not change any bullet-only-chain behavior (`"- - - -
Text"` renders identically to before, per §13.8's regression coverage) —
it only closes a gap that had no way to manifest before ordered rendering
existed at all.

### 13.4 Rendering architecture: real text, no substitution, `min-width` + right-align

Implemented in `listMarkerDecoration.ts` (`MARKER_MARK_ORDERED`,
`.cm-ordered-list-marker` in `MarkdownEditor.css`).

- **Real, visible text — never glyph-substituted.** Unlike `*→•` (§3), a
  digit sequence has no product-approved substitute glyph, so none of
  bullets' `data-marker-glyph`/`::before`/`color: transparent` machinery
  is reused. The marker span's own text content is the literal `"1. "`/
  `"10. "`/`"100. "` — confirmed live (`element.textContent` matches
  `state.doc` exactly, `Selection.toString()` over the span returns the
  real characters).
- **Tint via the pre-existing shared `cm-list-marker` class** (already
  anticipated in `MarkdownEditor.css`'s own comment on that class before
  this session, per §2's record) — ordered numbers get
  `--marker-foreground` coloring, unlike bullets which deliberately don't
  (§2's own "render exactly as written, never tinted" requirement is
  bullet-specific; ordered numbers were always meant to get a tint).
- **`min-width: var(--marker-width)` (20px), not bullets' fixed `width`**
  — the carried-forward design intent from §12, now implemented: `1.`/
  `2.`/single-digit markers sit at the same 20px floor bullets use;
  `10.`/`100.` grow the box past that floor via ordinary CSS, no JS
  measurement (`min-width` is a floor an `inline-block`'s own natural
  content width can always exceed). Measured live: `1.`/`2.` render at
  exactly 20px, `10.` at ~24.9px, `100.` at ~34.6px — never clipped,
  confirmed both by automated test and live in the running app.
- **`text-align: right`, not bullets' `center`**: flushes each marker's
  own separator-end (content-start) against *that marker's own* box's
  right edge — the same convention `.cm-quote-marker` already uses
  (`text-align: end`), for the same "flush the boundary against the box
  edge" reason.
- **ACCEPTED LIMITATION, measured and documented, not silently
  discovered later**: this does **not** unify content-start *across*
  sibling items of different digit counts on separate physical lines —
  `1.`/`2.` both start content at the same measured x (both at the 20px
  floor), but `10.`'s content starts a few pixels further right and
  `100.`'s further still (measured live: box right edges at
  `445.83px`/`450.70px`/`460.47px` respectively for `1.`/`10.`/`100.` in
  one test document). A real browser `<ol>` avoids this via native list
  layout that reserves one shared column sized to the widest marker in
  the *whole* list — not achievable here without measuring every sibling
  `ListItem`'s marker width up front and forcing a uniform box width
  across the block, which no per-line `Decoration.mark` in this codebase
  (bullets' or this one) does today. This was investigated, not
  discovered as a surprise — an earlier draft of this exact doc comment
  over-claimed cross-line alignment before the live measurement caught
  it; corrected here and in `MarkdownEditor.css`. Not clipped, not
  overlapping content, just not column-aligned across differing digit
  counts — a scoped-out cosmetic limitation, the same category as §5's
  selection-boundary gap.
- **No caret-assoc or selection-boundary fix needed for this kind** — and
  this was verified, not just reasoned about: because the real, visible
  text's own right edge always coincides with its own box's right edge
  by construction (no centered-then-hidden intermediate step the way
  bullets have), there is no glyph-vs-box mismatch for `coordsAtPos` (§4)
  or `drawSelection()` (§5) to disagree about in the first place.
  `listMarkerCaretAssoc()`'s guard (`listContentStart`, generalized from
  `bulletContentStart`) was broadened to check ordered content-start too,
  defensively — kept kind-agnostic since the check itself is cheap and
  self-heals if a future font/box change ever did introduce a mismatch —
  but live verification (typing at content-start of `"10. |Wide"`,
  inserting a probe character, confirming it landed exactly at
  content-start after `Home`+four`ArrowRight`s) found the position
  correct with no visible gap, matching the reasoning.

### 13.5 Backspace: extended to ordered lists — the decision §8 deferred

§8 originally, explicitly, recorded ordered-list Backspace exclusion as "a
separate, not-yet-made product decision." This session made that
decision: **`deleteBulletMarkerSeparator`'s two-shape rule now applies
identically to ordered markers.**

- **Non-empty item** (`1. |Text`): removes only the separator, keeping
  the marker — `1.|Text`. Verified live: content-start Backspace on `"10.
  |Wide"` produced `"10.|Wide"` in the running app, and by automated test
  for `1.`/`10.`/`1)` (paren-style) and a later-item case.
- **Empty item** (`1. |`): removes marker and separator together — `|`
  (blank line), for the identical "never leave a bare marker that looks
  indistinguishable from nothing-typed-yet" reasoning §8 established for
  bullets (a bare `1.` renders exactly as undecorated text, same as a
  bare `-`, so the ambiguity is the same).
- **Why the decision resolved this way**: nothing in §8's own reasoning
  for either shape referenced bullet-specific state — `classifyMarkerText`
  (shared with the rendering layer) already accepts either kind, and the
  only code change needed was widening `deleteBulletMarkerSeparator`'s
  `marker.parent?.parent?.name !== 'BulletList'` guard to also accept
  `'OrderedList'`. No new logic, no new shape, no renumbering of any
  sibling item — the deletion never touches any line but the one the
  cursor is on, exactly like the bullet case.
- **The function and its exported name stay `deleteBulletMarkerSeparator`**
  (not renamed) — an intentional, narrow scope decision: renaming a
  function whose behavior is otherwise unchanged, purely to reflect a
  guard widening, was judged not worth the diff noise against every
  existing bullet-era call site and test; the doc comment above it
  records the extension explicitly so a reader is never misled by the
  name alone.

### 13.6 Ordered-list numbering: the answer, precisely

The original request explicitly flagged this as **NOT YET INVESTIGATED**
unless a prior decision existed. None did; this session investigated and
resolved it, with two distinct, deliberately different answers depending
on which command produces the new line:

1. **Plain end-of-line Enter** (`"5. B|"` + Enter): entirely upstream CM6
   behavior (`continueMarkup`/`insertNewlineContinueMarkupCommand`,
   `nonTightLists: false` — already configured, untouched by this
   session), which computes the new item's number as **the immediately
   preceding sibling's own literal number, plus one** — confirmed live
   (§13.1): `"5. A\n5. B"` + Enter → `"5. A\n5. B\n6. "`, not `"3. "`
   (item count) and not `"5. "` (verbatim repeat).
2. **Content-start split** (`"1. |Text"` + Enter, `Enter` inside a
   `preserveListMarkerOnContentStartSplit`-eligible position): the
   **opposite** policy — the marker is copied **verbatim**, never
   incremented. Confirmed live: `"1. |Text"` + Enter → `"1.\n1. |Text"`
   (both lines read `1.`), not `"1.\n2. |Text"`.
3. **Existing lines are never renumbered by anything in this codebase**,
   ever, for any reason — confirmed at the parser level (§13.1: `"5. A\n5.
   B\n5. C"` parses and stays exactly as typed) and at the editing-command
   level (no command in `markdownEnterKeymap.ts`/`listMarkerDecoration.ts`
   rewrites a marker on a line the cursor isn't creating).

**Why (2) deliberately does not match (1)**, stated explicitly so a
future reader does not "fix" this into false consistency: a content-start
split is not "continuing the list with a new entry" (the case upstream's
own auto-increment is designed for) — it is dividing one line's *existing*
marker between two lines. The correct number for both resulting lines is
the one the user actually typed, copied verbatim; inventing an
incremented number here would silently author content the user never
typed, which is exactly what this entire architecture's "Markdown source
is the sole canonical truth, editing commands never invent content"
principle (§1, §7, §9) forbids. This mirrors
`preserveBulletMarkerOnContentStartSplit`'s original, pre-existing bullet
behavior exactly (a bullet has no number to increment, so this
distinction was invisible until ordered lists existed to expose it) — not
a new principle invented for ordered lists, but the same one, now visible
in a case where it wasn't testable before.

### 13.7 Enter: `exitLazyContinuationBulletLookalike` extended to ordered lookalikes

`LIST_MARKER_LOOKALIKE` (renamed from `BULLET_LOOKALIKE`) now matches
`[-+*][ \t]+` **or** `\d{1,9}[.)][ \t]+`. Verified live and by automated
test: `"1. Parent\n        1. Child|"` (8-space indent — confirmed by a
fresh parser probe to be lazy-continuation text of `Parent`'s own
paragraph, not a real nested `ListItem`, the identical shape §1/this
fallback's own doc comment already established for bullets) + Enter
produces `"1. Parent\n        1. Child\n        |"` — a newline plus the
physical line's own leading whitespace, no marker invented, exactly
mirroring the bullet case.

### 13.8 Test coverage added this session

- `listMarkerDecoration.test.ts`: a new `'ordered-list markers'` describe
  block — real-text rendering (no substitution), repeated-number
  verbatim rendering (`5. A`/`5. B`/`5. C`), paren-style markers, wider
  markers (`10.`/`100.`) not truncated, nested ordered items, the
  10-digit CommonMark limit, ordered task-list exclusion, and a `'mixed
  bullet + ordered'` sub-block covering independent adjacent lists and
  all three same-line-collapse-crosses-kinds shapes (§13.3). The stale
  pre-extension exclusion test ("ordered-list markers are never marked")
  was replaced, not left alongside the new behavior.
- `markdownEnterKeymap.test.ts`: ordered and paren-style content-start
  split (verbatim marker, not incremented — §13.6), and a new `'same-line
  marker collapse'` describe block closing the pre-existing "live-verified
  only" gap (§6/§12's open-questions list) for bullets *and* adding first
  coverage for the ordered and mixed-kind cases — two-deep and four-deep
  bullet chains, a three-deep ordered chain, two mixed-kind chains (bullet-
  first and ordered-first), genuine multi-line nesting (unaffected,
  including an ordered Parent/Child case exercising upstream's own
  auto-increment), and a mid-line-Enter control case (falls through to
  ordinary splitting, not this command). Two pre-existing tests that
  pinned the old exclusion/incrementing behavior at end-of-line-vs-
  content-start were updated to the new, correct expectations, not
  deleted silently.
- `markdownBulletBackspace.test.ts`: the old "ordered lists are explicitly
  excluded" describe block was replaced with a "symmetric with bullets"
  block covering non-empty (dot- and paren-style, wider markers, later
  items), empty-item removal, and 3-space-separator collapse.
- `markdownDeepBulletEnter.test.ts`: the old "ordered lists are not
  touched… (regex excludes digits)" test was replaced with one asserting
  the new, verified-live symmetric lazy-continuation behavior (§13.7).
- All pre-existing bullet-only tests across all four files pass
  unchanged — confirmed by running the full suite (147+62+51+... tests,
  1199 total across the `features/markdown` tree) after every edit, not
  merely at the end.
- `tsc --noEmit` clean across `apps/app` after every edit.
- Live-verified in the running Clutter webapp (per this project's own
  "test in the real webapp, not just an isolated harness" standing
  practice): ordered rendering geometry (including the `min-width`
  growth measured via `getBoundingClientRect`), Backspace at ordered
  content-start, Enter at ordered content-start (verbatim, not
  incremented — contrasted live against plain end-of-line Enter's own
  auto-increment), and the mixed-kind same-line collapse (`"- 1. Text"`
  rendering exactly one marker, and Enter continuing at that same,
  first/outermost level).

### 13.9 What remains open after this extension

- **Cross-line content-column alignment for differing digit counts**
  (§13.4) — an accepted, measured, documented cosmetic limitation, not
  silently unresolved. Closing it would require whole-list marker-width
  measurement, out of scope for this extension and not requested.
- **Ordered task-list rendering** — still entirely unimplemented,
  unchanged by this session; §12's task-list open questions apply
  identically to an ordered task item as to a bullet one (nothing in this
  session's investigation found a reason they'd differ).
- **Delete (forward)** at an ordered marker boundary — unaddressed,
  same `ACCEPTED LIMITATION` §8 already recorded for bullets, now
  symmetric in scope (i.e., equally unaddressed for both kinds, not a
  new gap specific to ordered).
- **The 20px selection-column gap (§5)** — not re-investigated for
  ordered markers specifically in this session; ordered markers' own
  flush-right-within-own-box layout (§13.4) means the *mechanism* that
  caused §5's gap for bullets (centered real text vs. box edge) does not
  apply the same way, but a dedicated live measurement of
  `drawSelection()`'s boundary-row behavior across an ordered list was
  not separately performed — flagged here rather than silently assumed
  clean.

---

## Open questions / tracked gaps (consolidated)

1. Automated test coverage is missing for: the `listMarkerCaretAssoc`
   content-start caret fix (§4) — live-verified only. (The same-line
   first-marker-per-line decoration rule, §7/§13.3, and
   `continueFirstSameLineListLevel`, §6/§13, both gained automated
   coverage in the §13 ordered-list extension, for bullets, ordered, and
   mixed-kind chains alike — no longer open.)
2. Delete (forward) at a marker boundary remains an accepted, deferred
   gap with zero Markdown awareness (§8), symmetric across bullet and
   ordered (§13.9) — not addressed by any work in this document.
3. The 20px selection-column gap (§5) has a custom-`layer()`-based
   complete fix identified but not built — accepted as a cosmetic
   limitation for now, not silently unresolved. Not re-verified for
   ordered markers specifically (§13.9).
4. Several two/three-step sequences in §11 are inferred from
   independently-verified single steps, not independently re-run —
   flagged individually in that section, not to be treated as equal-
   confidence to directly-observed results.
5. Cross-line content-column alignment for ordered markers of differing
   digit counts is a measured, accepted cosmetic limitation (§13.4/§13.9),
   not achievable without whole-list-aware marker-width measurement.
6. Every task-list architectural question in §12 is genuinely open,
   including for ordered task items specifically (§13.9) — nothing in
   the §13 investigation found reason to expect them to differ from
   bullet task items, but this was not independently verified.
