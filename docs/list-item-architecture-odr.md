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

### An empty marker directly after a paragraph never produces `ListItem` at all — INVESTIGATED, not a bug (2026-08-29)

**Reported symptom**: typing an ordinary paragraph, pressing Enter, then
typing `- ` (or `* `/`+ `) does not render a bullet marker until real
content is typed after it — e.g. `- Text` renders correctly, but the
bare `- `/`* `/`+ ` line sitting directly under a paragraph, with no
blank line between them, never becomes a marker no matter how long you
wait.

**This is not a decoration-code guard, and not a renderer bug.**
Confirmed directly against the installed `@lezer/markdown@1.7.2` grammar
(the exact `markdown({ extensions: markdownGrammarExtensions, addKeymap:
false })` config the editor uses, via a throwaway script — not
reconstructed from memory): for this exact input, **no `ListItem` node
exists in the tree at all**. There is nothing for `listMarkerDecoration.ts`
to fail to decorate — the tree it walks genuinely contains no list.

```
Source: "Some paragraph text\n- "

Document [0,22)
  SetextHeading2 [0,22) "Some paragraph text\n- "
    HeaderMark [20,21) "-"
```

```
Source: "Some paragraph text\n* "   (or "\n+ ")

Document [0,22)
  Paragraph [0,22) "Some paragraph text\n* "
```

Two independent, genuine CommonMark rules — not a Lezer bug, not a
grammar misconfiguration, not something introduced by any of Clutter's
grammar extensions or the `IndentedCode` removal — combine to produce
this:

1. **A line consisting only of `-` (optionally with trailing spaces)
   directly below a non-blank paragraph line is a Setext heading level-2
   underline**, and this reading takes precedence over "start of a new
   list." This is the standard CommonMark Setext-heading construct
   (`=` produces `SetextHeading1`, confirmed with the same script) — it
   is not specific to lists, bullets, or Clutter's own extensions.
2. **An empty list item cannot interrupt a paragraph** (CommonMark's own
   list-interruption rule — a list item whose own first line is blank
   cannot begin a new list directly under an unrelated paragraph without
   an intervening blank line). This is why `* `/`+ ` — which aren't
   Setext underline characters, so rule 1 never applies to them — still
   don't produce a `ListItem`: they fall back to ordinary lazy
   continuation of the *same* `Paragraph` instead.

**The moment real content follows the marker, both effects vanish and a
genuine `ListItem`/`ListMark` appears immediately, even with no blank
line before it** — confirmed directly:

```
Source: "Some paragraph text\n- Text"   (no blank line, real content)

Document [0,26)
  Paragraph [0,19) "Some paragraph text"
  BulletList [20,26) "- Text"
    ListItem [20,26) "- Text"
      ListMark [20,21) "-"
      Paragraph [22,26) "Text"
```

identically for `* Text`/`+ Text`. This is CommonMark's ordinary "a list
can interrupt a paragraph, as long as its first item isn't empty" rule
working exactly as specified — the underlying grammar has no ambiguity
once there's real content to disambiguate with.

**Answering the ten investigation questions against this fact**:

1. `state.doc` immediately after typing `- `/`* `/`+ ` following a
   paragraph (no blank line) is exactly `"Some paragraph text\n- "` (etc.)
   — plain concatenation, nothing rewritten, consistent with §1's opening
   claim.
2. The actual Lezer tree at that moment is `SetextHeading2` (for `-`) or
   a single, unbroken `Paragraph` (for `*`/`+`) — shown above. No
   `BulletList`/`ListItem`/`ListMark` node exists anywhere in either tree.
3. Whether an empty marker produces `BulletList → ListItem → ListMark`
   depends entirely on what precedes it on the previous physical line,
   confirmed by direct parse for all four cases the investigation asked
   for:
   - **(a) first line of the document**: **yes** — `"- "` alone parses as
     `BulletList → ListItem → ListMark` (already established §1, re-
     confirmed here).
   - **(b) after an ordinary paragraph, no blank line**: **no** — absorbed
     into `SetextHeading2` (`-`) or the paragraph itself via lazy
     continuation (`*`/`+`); see trees above. This is the case the
     reported symptom is actually about.
   - **(c) after another list item** (`"- Item\n- "`): **yes** — the
     second line parses as a sibling `ListItem [7,9) "- "` with `ListMark`
     as its only child, no `Paragraph` sibling (confirmed by direct
     parse). A list item, unlike a paragraph, can freely have an empty
     sibling item follow it — the paragraph-interruption restriction in
     rule 2 above only applies to a list attempting to interrupt a
     *different* block kind.
   - **(d) after a blank line** (`"Some paragraph text\n\n- "`): **yes** —
     a blank line always ends the preceding paragraph outright, so there
     is no paragraph left to "interrupt"; `"- "` starts a fresh
     `BulletList → ListItem → ListMark` exactly as case (a) does
     (confirmed by direct parse: `BulletList [21,23) → ListItem [21,23) →
     ListMark [21,22)`, no `Paragraph` sibling, separator gap trailing to
     end of document).
4. `listMarkerDecoration.ts` never receives a `ListMark` node for case
   (b) — there is none to receive, because `buildDecorations`'s tree walk
   only visits nodes the parser actually produced, and it produced none.
   For cases (a)/(c)/(d), it **does** receive `ListMark` and (per point 6
   below) does decorate it.
5. **No guard in the decoration code prevents case (b)** — the renderer
   is never reached for it. The suppression happens entirely upstream, in
   the parser's own block-level precedence rules (Setext heading
   recognition, list-interrupting-paragraph restriction), before
   `listMarkerDecoration.ts`'s `buildDecorations`/`getListMarkRange` ever
   runs.
6. `getListMarkRange` (`listMarkerDecoration.ts`) does **not** require
   content after the marker/separator, and this is intentional, already
   covered by existing test coverage (`listMarkerDecoration.test.ts`,
   "marker + separator (no content yet) IS marked"). Traced through the
   function directly: `separatorRangeAfter` computes `to` as
   `Math.min(marker.nextSibling?.from ?? marker.to + 1, lineEnd,
   docLength)` — when a `ListItem` has no sibling after `ListMark` at all
   (the empty-item shape in cases a/c/d), this correctly resolves to "one
   character past the marker, capped at end of line," and the resulting
   gap text (a single space) passes the `gapText.trim() === ''` check, so
   `getListMarkRange` returns a valid, non-null range and the item **is**
   decorated. The only thing `getListMarkRange` refuses is a truly *bare*
   marker with no separator whitespace at all (`"-"` with nothing after
   it, mid-keystroke) — a distinct, already-documented gate (§1's "bare
   marker" paragraph, §2), not related to this investigation's symptom.
7. The `seenLines`/first-marker-per-physical-line logic (§7) is **not
   involved** in case (b) at all — it only ever suppresses a *later*
   `ListMark` on a line that already had an earlier one claimed within
   the same `buildDecorations` pass. Case (b) never reaches
   `buildDecorations`'s tree walk with any `ListItem` node on that line to
   begin with, so there is nothing for `seenLines` to (correctly or
   incorrectly) suppress. Re-confirmed directly: cases (a)/(c)/(d) each
   produce exactly one `ListItem` on their line, so `seenLines` has no
   opportunity to misfire there either.
8. `-`, `*`, and `+` were tested independently (trees above and in the
   verification script): the two produce different intermediate node
   kinds (`SetextHeading2` vs. plain `Paragraph` lazy continuation) but
   the same observable outcome — no `ListItem` — for case (b).
9. `paragraph → Enter → - → Space` (`"Some paragraph text\n- "`) produces
   `SetextHeading2`; `empty document → - → Space` (`"- "`) produces
   `BulletList → ListItem → ListMark`. These are genuinely different
   trees for genuinely different (if visually similar) documents — not
   two renderings of the same structural fact.
10. Pressing Enter while in the paragraph-preceded state does not operate
    on "the empty bullet," because none exists — the cursor is inside a
    `SetextHeading2`. Confirmed directly: `"Some paragraph text\n- \n"`
    (Enter pressed after `- `) still parses as `SetextHeading2` covering
    both lines, unchanged in kind. Continuing to type more marker
    characters can change the outcome again — e.g. `"Some paragraph
    text\n- -"` parses as `Paragraph` + `BulletList` (two nested empty
    items) once a second `-` makes the line no longer a valid Setext
    underline or thematic break — but this is the parser responding to
    the new document content each time, not any special "empty bullet"
    Enter/Backspace handling; `markdownEnterKeymap.ts`'s existing
    handlers were not exercised at all for the reported symptom's
    starting state; they operate over whatever tree an existing edit
    left behind.

**Verdict: current behavior is correct, not a bug.** The renderer is a
pure function of `state.doc` + the parsed tree, exactly as the
architectural constraint requires, and for case (b) the tree contains no
list to render. The apparent "doesn't become a bullet until you type
content" behavior is CommonMark's own, standards-compliant list-
interruption and Setext-heading precedence rules, faithfully reproduced
by the installed, unmodified grammar — the same class of upstream
ambiguity already documented for `"- - - "` (§1's `HorizontalRule` case)
and the deepest-`ListItem` Enter behavior (§6). No parser change, no
decoration-code change, and no typing-history-dependent interception
would be compliant fixes here even if one were wanted — the first two are
already-forbidden per this section's own "why we do not modify
Lezer/parser behavior" reasoning above, and the third is already
INVESTIGATED + REJECTED in §7 for the identical reason (a parser is, and
must remain, stateless with respect to keystroke history). There is no
CommonMark-compliant way for `"Some paragraph text\n- "` to mean anything
other than what it currently parses as.

**This section previously concluded "accepted limitation, closed."
Superseded (2026-08-29) — see the subsection immediately below.** The
parser-tree facts above are unchanged and still correct; what changed is
that "CommonMark parses it this way" and "Clutter's product must therefore
render it this way" are separate questions, and the second one was never
actually investigated — only assumed. The investigation below treats it
as an open product decision with concrete, costed options, not a settled
limitation.

### Can Clutter's product behavior diverge from this parse, and at what cost? — INVESTIGATED, OPEN (2026-08-29)

**Question**: could Clutter make `text here\n- ` (and `\n* `/`\n+ `)
immediately render as an empty bullet, without violating the
already-Locked constraints (renderer stays a pure function of
`state.doc` + tree; the parser is never hand-patched; no typing-history-
dependent decoration)?

**Traced directly against the installed `@lezer/markdown@1.7.2` source**
(`node_modules/@lezer/markdown/dist/index.js` — the actual code this
investigation is about, not its published docs) to find every lever the
*public* extension API (`MarkdownExtension`/`parser.configure(...)`, the
same mechanism already used for `wikiLinkSyntax`/`tagSyntax`/`dateSyntax`/
the HR variants/`{ remove: ['IndentedCode'] }`) actually exposes over
this behavior — as opposed to a hand-patched fork, which stays out of
scope per this document's own already-Locked "why we do not modify
Lezer/parser behavior" reasoning.

**Root mechanism, found in the private (unexported) `isBulletList`**:

```js
function isBulletList(line, cx, breaking) {
    return (line.next == 45 || line.next == 43 || line.next == 42) &&
        (line.pos == line.text.length - 1 || space(line.text.charCodeAt(line.pos + 1))) &&
        (!breaking || inList(cx, Type.BulletList) || line.skipSpace(line.pos + 2) < line.text.length) ? 1 : -1;
}
```

`breaking` is true exactly when the parser is asking "can this line
interrupt the paragraph currently being accumulated" (confirmed by
reading every call site — `breaking` is never `true` for cases (a)/(d),
only for (b)/(c), and `inList(cx, Type.BulletList)` is what makes (c) pass
despite `breaking`). The third clause is the exact CommonMark "empty item
cannot interrupt a paragraph" rule from §1: when `breaking` is true and
we're not already inside a list, `line.skipSpace(line.pos + 2) <
line.text.length` requires *real content* after the marker+separator —
this is the single line of logic responsible for the `*`/`+` half of the
symptom. `isOrderedList` (same file) has the identical shape of
restriction for ordered markers.

For `-` specifically, `isHorizontalRule` explicitly steps aside for a
Setext reading first (`// Setext headers take precedence`, line 313-317
of the same file) — this is a **separate, earlier** check than
`isBulletList`, so even if `isBulletList`'s restriction were lifted, `-`
would still lose to `SetextHeading` first. Two independent gates, not
one, both would need addressing for `-`.

**Is either gate reachable through the public extension API without a
full reimplementation? Checked directly against what
`@lezer/markdown`'s `index.d.ts` actually exports**
(`export { Autolink, BlockContext, type BlockParser, ..., MarkdownParser,
... }` — the complete list): `isBulletList`, `isOrderedList`,
`isSetextUnderline`, and the internal `ListParser`/`SetextHeadingParser`
classes that use them are **not exported**. `MarkdownConfig.parseBlock`
does let a `{ name: "BulletList", parse: ... }` entry **fully replace**
the built-in parser for that node name (confirmed by reading
`MarkdownParser.configure`'s own `parseBlock` handling: `found > -1` →
`blockParsers[found] = spec.parse` — a straight replacement, no way to
call through to "the old one, but with this one condition removed"). So
the only lever available is: **write an entirely new `BulletList`/
`OrderedList` block-parser from scratch**, not adjust the shipped one.

**What that would actually require, concretely**: CommonMark list-item
parsing is not just "does this line start with `-`/`*`/`+`" — the same
parser also owns continuation-line indentation thresholds, the
tight/loose blank-line-between-items distinction, nested-list depth
bookkeeping via `cx.stack`, and the interaction with the same-line-
collapse ambiguity this very document spent §1/§6/§7 characterizing in
detail. A replacement `parse` function would have to reproduce all of
that correctly, forever, independently — `@lezer/markdown` gives no
supported way to delegate "everything except this one interrupt-
restriction" back to its own, already-correct implementation. This is
not a small patch; it is taking ownership of a nontrivial slice of
CommonMark's own block-parsing algorithm, and re-verifying every case
this document's own investigations already needed multiple sessions to
get right (§1's nesting/`HorizontalRule` ambiguity, §6's Enter fix, §7's
same-line collapse) against a parser Clutter now also has to maintain
correctness for, across every future `@lezer/markdown` version bump.

**Separately, for `-`: this is not just an implementation cost, it is a
real product trade-off**, because Setext H2 is not a dead or unused
construct in Clutter — it is fully live (`headingMarkerDecoration.ts`,
`inlineLivePreviewRegion.ts`, `markdownIndentContext.ts`, and a dedicated
test suite all treat `SetextHeading1`/`SetextHeading2` as a real,
supported heading form, confirmed by direct source search, not
assumption). Any change that makes `text\n- ` become a list by default
means a user who deliberately types a Setext H2 heading exactly that way
(`Heading\n---` differs only in whether real heading text or nothing
precedes the marker on the underline — but an *empty* Setext underline
attempt, `Heading\n-`, mid-keystroke before the rest of `---` is typed, is
indistinguishable from an attempted empty bullet at the exact instant
being asked about) would instead see a bullet appear. There is no way to
know the user's intent from the document alone at that keystroke — both
readings are genuinely valid, incomplete prefixes of two different,
both-real Clutter features. Deciding "list wins" is a legitimate product
choice, but it is one that silently changes what an existing, tested,
shipped construct does for an input shape it currently owns — not a
side-effect-free rendering improvement.

**A separate, smaller-blast-radius idea, evaluated and also rejected as
disproportionate for now**: a brand-new, additive, low-priority
`parseBlock` entry (not replacing `BulletList` itself) that recognizes
only the exact narrow shape "line is exactly `-`/`* `/`+ ` and nothing
else, directly under a `Paragraph`, otherwise unclaimed" and emits a
distinct, Clutter-only lookalike node for `listMarkerDecoration.ts` to
optionally also decorate — without trying to make it a *real*,
continuable, nestable list at the parser level at all. This avoids
reimplementing list continuation/nesting, but for `-` it would still need
`before: "SetextHeading"` precedence to win the line at all, which is the
exact same product trade-off above, not a way around it; for `*`/`+` it
is smaller and real content typed immediately afterward would need to
hand off cleanly from this lookalike node to a genuine `ListItem` the
instant `isBulletList` itself would already succeed (i.e., the moment
real content appears) — a seam that would need its own careful
verification (does `listMarkerCaretAssoc`/Enter/Backspace need to know
about this second, parser-adjacent node kind, or can they ignore it
entirely because it never coexists with real editing operations on
non-empty content?). Not yet built or trace-verified to the level the
rest of this document holds itself to — recorded here as the
least-invasive option identified, not as a decision.

**Status: OPEN, not decided.** No option above is free, and the `-` case
in particular is a genuine two-feature ambiguity requiring a real
"list wins" or "heading wins" product call, not just an implementation
choice. Nothing has been implemented. See the options above for what an
implementer would actually be signing up for before picking one.

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

**Not to be confused with §1's "empty marker directly after a paragraph"
finding**: that case (a bare `- `/`* `/`+ ` typed right after a paragraph,
no blank line) is a *different* phenomenon — the parser produces **no**
`ListItem`/`ListMark` at all for it (absorbed into `SetextHeading2` or
ordinary paragraph lazy-continuation), so `seenLines` and this policy
never even run for it. This section's own same-line-collapse policy only
ever operates on markers the parser *did* produce.

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

### AMENDED DECISION (2026-08-30 — REVERTED 2026-08-30, see §18.16): logical list-level Tab/Shift-Tab

**STATUS: REVERTED. Not the active contract.** This amendment was
implemented, then found — through the §18.15 investigation and the
product owner's own re-evaluation of its result — to violate the
locked per-physical-line-independence requirement in a way that could
not be reconciled by further patching. It is kept below in full,
unmodified, as the historical record of what was tried, why, and
exactly what was found wrong with it. **§18.16, at the end of this
subsection, is the authoritative record of the reversion — read it
before treating anything below as current.** The active contract is the
"Final decision: uniform per-line indentation" section immediately
below this one, which is no longer superseded by anything here.

*(Original framing, kept verbatim below for the historical record —
"supersedes," "IMPLEMENTED," etc. describe this amendment's own
now-ended lifecycle, not the current state of the codebase.)*

**This supersedes the "Final decision: uniform per-line indentation"
section immediately below for list items specifically.** That section's
own text, and its "no construct awareness" framing, is kept verbatim
underneath as the historical record of the prior decision and the
investigation (§17, §18) that led to amending it — do not delete it.
Non-list lines are **explicitly unaffected** by this amendment; the old
section's description of their behavior remains currently true. **The
old section's own Locked, per-physical-line-independence invariant is
also explicitly unaffected** — see the hard constraint below and §18.13.

**Hard constraint, reconciled before implementation (§18.13)**: an
earlier draft of this amendment described applying a computed delta
across an item's "full node span" (marker line + continuation +
descendants). That draft was rejected before any code shipped — it
would have moved a `ListItem`'s unselected descendants automatically,
reintroducing exactly the subtree-movement semantics the original
decision (immediately below) deliberately rejected and the codebase
once reverted. **The shipped implementation touches only physical
lines explicitly covered by the selection — never a line inferred from
structural ancestry.** `- Parent\n  - Child` with only `Parent`'s line
selected changes only `Parent`; `Child` is left byte-for-byte unchanged
even though it is `Parent`'s structural descendant (Parent and Child
may become siblings as a result — an accepted consequence, identical in
kind to the original decision's own "Case A"). Selecting both lines
changes both, but only because both were explicitly selected, and each
computes its own target **independently** — never by reusing another
selected line's delta, and never against a hypothetical state where
some other selected line has already moved. Every target in this
amendment is computed from the same, single pre-edit tree, for every
selected line, with zero coupling between lines.

**New contract**: for a physical line that is a `ListItem`'s own marker
line (in the pre-edit tree) and is explicitly selected, Tab/Shift-Tab
set *that one line's* leading whitespace to a **target column computed
from the current syntax tree**, not a fixed constant — independently of
every other selected line:

- **Tab**: target = the item's true preceding sibling's existing nested-
  list reference column, if that sibling already has one; otherwise
  `precedingSibling'sOwnColumn + markerWidth(precedingSibling) + 1`
  (§18.2's confirmed content-column formula), both read from the
  **pre-edit** tree regardless of whether that preceding sibling is
  itself also selected in this same operation. If the item has no
  preceding sibling (it's its own list's first item) or is already at
  the logical depth ceiling, there is no structural destination — see
  §18.14 immediately below for what happens then; it is **not** simply
  "no-op."
- **Shift-Tab**: target = the item's immediate parent `ListItem`'s own
  column, read from the pre-edit tree. **No target (no-op) if the item
  is already top-level.**
- **No grouping, no "run," no delta reuse across lines.** A multi-line
  selection touching several `ListItem`s computes each one's target
  completely independently; when two selected siblings happen to land at
  the same resulting column, it is because they shared the same pre-edit
  column and comparable marker geometry, not because of any mechanism
  that intentionally keeps them together. **Multiple independent list
  containers touched by one selection are each resolved independently**,
  for the same reason — there is no shared state to keep separate.
- **Only the explicitly selected line moves.** A `ListItem`'s own
  continuation content or nested descendants are touched only if their
  own physical line is *also* part of the selection — and if a
  continuation line is selected, it is not itself a `ListItem`'s own
  marker line, so it uses the flat fallback below, independently of
  whatever its owning item's own marker line did.
- **A physical line that is selected but does not resolve to a
  `ListItem`'s own marker line** (a heading, blockquote, orphan
  paragraph, or a list-owned continuation line) **keeps the existing,
  unchanged flat `± INDENT_STEP_SPACES` behavior** described in the
  section below — this amendment is additive and provably scoped to
  list-item marker lines only.
- **List-item nesting depth is capped at 5 logical levels** (replacing
  the old flat 10-space/`MAX_INDENT_SPACES` column ceiling, which no
  longer has a consistent meaning once the column-per-level varies by
  marker width) — an item already at ancestor-`ListItem` depth 5 has no
  further *logical* Tab target (though see §18.14: it may still grow via
  the free-indentation fallback). This is a **judgment call made during
  implementation, not something §18 explicitly specified** — flagged
  here rather than silently decided; it preserves the old ceiling's
  intent (bound unbounded growth) in the new model's own terms (levels,
  not columns). The non-list fallback path keeps its own existing
  column-based ceiling unchanged.
- **Numbering is untouched by construction**: every emitted change is a
  `{ from, to, insert: ' '.repeat(n) }` replacement of a line's leading-
  whitespace range only; no code path reads or writes a `ListMark`'s
  digits or delimiter. §16's numbering question remains fully separate
  and still undecided.
- **No coordination with Enter's §15 guard is needed or added** —
  confirmed directly (§18.12 item 4): Enter's `continueMarkupPreservingStructure`
  reads the tree at Enter-time and is unaffected by how the surrounding
  indentation arose.
- **Cursor/selection mapping uses the existing mechanism unchanged** —
  `state.selection.map(changeSet, 1)` for Tab's forward-insertion case
  (exactly as today), confirmed to require no new logic even though the
  delta is no longer a constant (§18.12 item 3).
- **One composed `ChangeSet`, one dispatched transaction, one undo
  step** — same shape as today's `markdownIndentDirection`, just with
  tree-derived rather than constant per-line `ChangeSpec`s, computed by
  a single per-line loop with no cross-line dependency.

**Implemented**: `markdownIndentKeymap.ts` (`logicalListItemChange`,
`logicalTabTarget`, `logicalShiftTabTarget`, `contentColumnOf`,
`precedingSibling`, `existingNestedList`, `listItemDepth`,
`collectListItemsByMarkerLine`), `markdownIndentKeymap.test.ts` (65
tests, including the explicit per-line-independence regression suite
"§18.13" required: Parent-only selection doesn't move Child, Child-only
selection doesn't move Parent, Parent+Child selection moves both
because both were explicitly selected, a multi-line range of siblings
changes every explicitly selected line independently, and mixed list/
non-list selection behavior is unchanged).

### §18.14 (2026-08-30, IMPLEMENTED): a single Tab press never no-ops for a list item — with a hazard-driven restriction

**Product requirement, given after §18.13 shipped**: "Tab always permits
the selected list line to move one indentation step deeper. When a
valid structural list destination exists, calculate the indentation
needed to reach that next logical level. When no such destination
exists, retain the previous free physical indentation behavior rather
than becoming a no-op."

**Finding, verified before shipping, not assumed**: implementing this
literally — always falling back to free `INDENT_STEP_SPACES` growth
whenever a list item has no structural destination, with no other
condition — **directly reopens Phase 17's Hazard 1** (§17.1), the exact
`ListItem`-swallowing corruption §18 was built to eliminate. Reproduced
directly: selecting `# Heading` + `10. A` + `11. B` as one range and
pressing Tab once (the heading forcing a genuinely multi-line operation)
corrupted `11. B` into lazy-continuation text of `10. A`'s own
paragraph — because A (previously a guaranteed no-op) now also moves,
but B's own target is still correctly computed from A's **pre-edit**
column (per §18.13's own per-line-independence requirement, which is
not being relaxed), landing in the gap between A's old and new geometry.
Also reproduced for bullets (landing at the *same* column as the
following item instead of nesting, since a bullet's fallback step
happens to equal its own content-column offset) and more severely for
3+-digit markers. This is not a rare edge case — it reproduces for any
multi-line Tab selection that includes a list's own first item together
with a later sibling.

**Resolution, chosen by the product owner after this finding was
surfaced**: restrict the free-indentation fallback to operations that
touch **exactly one physical line**. A single, isolated Tab press on a
lone list item (the overwhelmingly common real case — pressing Tab with
the caret on one line) now grows it via the same free `INDENT_STEP_SPACES`
physical indentation non-list lines already get, never a no-op. A list
item with no structural destination that is part of a **multi-line**
selection still has no target and stays put — exactly as §18.13 shipped
it — so a later selected sibling's own target, computed from that
item's unmoved pre-edit column, stays correct and Hazard 1 stays closed.
Shift-Tab is untouched by this entire question: it was never asked to
gain a fallback, and its own no-op (already top-level) has no physical-
indentation equivalent to fall back to in either case.

**Verification**: `markdownIndentKeymap.test.ts` gained a dedicated
describe block ("2026-08-30 refinement") with three tests — single-line
lone-item growth, and two explicit regression tests (1-digit-marker-
adjacent and 3-digit-marker-adjacent) proving the exact reproduction
above no longer corrupts `ListItem` structure when run through the
shipped code, asserting both resulting source and exact tree shape via
`listShape`. All 68 tests in that file pass; full suite unaffected
(3091 passing; the only 2 failing test files are pre-existing and
confirmed unrelated via `git stash`); `tsc --noEmit` clean; live webapp
verification repeated for both the single-line-growth case and the
multi-line-no-swallow case.

See §18/§18.12 for the full investigation, evidence, and rejected
alternatives (fixed 2, fixed 4, provisional-edit-and-retry) behind this
amendment. Implementation status is recorded at the end of this
amendment once landed (commit hash, test file, verification results) —
if this note still says "IMPLEMENTING NOW" it means the code change
described here had not yet been completed at last edit.

### §18.15 (2026-08-30, IMPLEMENTED): large multi-item Tab/Shift-Tab selections could silently swallow a `ListItem` past the depth ceiling — found by investigation, fixed with two narrow, same-invariant-compliant lookups

**Trigger**: after §18.14 shipped, verification of a large multi-item
selection (15 flat ordered-list items, select all, Tab pressed
repeatedly) found a genuine defect: after the 4th press, two items lost
`ListItem` status entirely, absorbed as lazy-continuation text of an
earlier item's own paragraph. Reported before any fix was attempted, per
instruction. This entry documents the investigation and the fix.

**Investigation — what was and wasn't the cause**. The hard constraint
was reaffirmed unconditionally throughout: no subtree movement, no
moving an unselected line, every explicitly selected line still
independently editable. The question posed was whether a *selected*
item's target may legitimately account for another *selected* item's
actual resulting (post-edit) column, rather than only ever reading a
stale pre-edit one — which is a question about the correctness of the
target *arithmetic* for lines that are already being edited, not about
which lines get edited (that set is unaffected either way).

Two genuinely distinct bugs were found, both the same root shape (an
item's target computed from an ancestor/sibling's *stale* column, once
that ancestor/sibling also moves in the very same operation) but via
two different relationships, needing two different fixes:

1. **Tab — sibling chains.** A flat run of touched siblings within one
   container (e.g. items 2–15 of a 15-item list, all selected) each
   independently recomputing `contentColumnOf(precedingSibling)` from
   that sibling's *pre-edit* column is fine only while none of them have
   moved yet. Across repeated presses, once a sibling in the middle of
   the chain hits the logical depth ceiling and reverts to "no target,
   stays put," the next sibling's independently-computed target — still
   based on the capped sibling's stale column — can land short of that
   sibling's real content-column floor, the Rule #5 gap (§17.3),
   swallowing it. **Tested first**: naive "always use the sibling's
   actual post-edit column" was considered and rejected — it produces a
   staircase (each sibling nesting one level deeper than the last)
   instead of the already-shipped, already-tested "all touched siblings
   become mutual siblings of each other" behavior (§18.13's own tests
   depend on this). The fix actually needed is the narrower, already-
   proven-correct one: **same-container delta *propagation*** — once one
   item in a contiguous touched run establishes a real delta (because
   its own true preceding sibling has a fixed, unmoving destination),
   every immediately-following touched sibling in that same container
   reuses that *exact* delta rather than recomputing its own target from
   a now-stale column. Implemented in `tabChangesForContainer`.
2. **Shift-Tab — ancestor chains.** Independently discovered while
   testing item 7's own boundary cases with digit-width-crossing markers
   (98.–107., nested via Tab, then select-all Shift-Tab): each item's
   target is its *parent's* column, and if that parent is *also*
   selected and dedenting in the same keypress, using the parent's stale
   pre-edit column produces the identical gap-swallow, just through the
   ancestor relationship instead of the sibling one. Delta propagation
   (rule 1) does not apply here — a parent lookup is not a same-
   container sibling chain — so the fix is a `resultColumn` map,
   populated in document order as each touched item's final column is
   decided, consulted before falling back to a live read. Document order
   is sufficient because a parent's own line is always physically
   earlier in the source than any of its descendants', so by the time a
   descendant asks, its ancestor (if also touched) has already been
   decided. Implemented in `logicalShiftTabTarget`/`logicalShiftTabChange`.

**Why neither fix touches the locked invariant**: both only change how
an *already-selected* line's own target number is computed. Neither
reads, infers, or acts on anything about a line that was not itself
independently and explicitly selected; neither emits a `ChangeSpec` for
any line beyond the one it was already going to touch. The "gap" that
was proven safe from multi-range selections in §18.13 (no untouched
sibling can sit between two touched ones in one container, since this
editor has no multi-range selection and a contiguous range covering two
siblings' lines necessarily covers every line physically between them)
applies identically here, since neither fix changes which lines are
touched — only what each already-touched line computes as its target.

**Verification — exhaustive, not spot-checked**: a temporary stress
probe (not committed — findings captured as permanent regression tests
instead) ran full Tab-then-Shift-Tab round trips, checking for any
swallowed `ListItem` after *every single press*, across: 15- and 20-item
flat ordered and bullet lists (8 Tabs, 10 Shift-Tabs each), a 3-item
baseline, a 6-item run straddling the exact depth-ceiling boundary, and
two digit-width-crossing runs (98.–107., 995.–1004., crossing the 2→3
and 3→4 digit boundaries respectively). All clean at every step; every
list fully round-tripped back to its exact original byte-for-byte flat
form. Permanent regression coverage added to
`markdownIndentKeymap.test.ts` (new "§18.15" describe block, 5 tests):
the exact 15-item and 98–107 reproductions (both directions), the
6-item ceiling-boundary round trip, and an explicit re-confirmation that
Parent-only/Child-only/Parent+Child independence (§18.13's own locked
tests) still holds unchanged. 73/73 tests pass in that file; full suite
unaffected (3096 passing, same 2 pre-existing unrelated failures
confirmed via `git stash`); `tsc --noEmit` clean; live webapp
verification repeated for the full 15-item build → 5 Tabs → 5 Shift-Tabs
round trip, matching the automated tests exactly, no console errors.

### §18.16 (2026-08-30, DECISION): the logical-target amendment (§9's amendment above, §18/§18.12–§18.15) is REVERTED

**What happened, in sequence.** §18.15 fixed a real, confirmed swallow
bug in the logical-target model (a 15-item flat ordered list losing two
items' `ListItem` status across repeated Tab presses) via two narrow
lookups — same-container delta propagation for Tab, a `resultColumn`
map for Shift-Tab's parent lookup — verified exhaustively (8 stress
scenarios, live webapp confirmation, 73 passing tests) to touch nothing
but each already-selected line's own target arithmetic. On review of
that fix, the product owner determined it was still the wrong direction
entirely: **a 15-item selection is supposed to move every selected line
by the identical physical delta — there is no product requirement, and
never was one, for Tab to compute a marker-width- or hierarchy-aware
target column at all.** The corrected contract, stated explicitly:

> Tab = add exactly one `INDENT_STEP_SPACES` to every selected physical
> line. Shift-Tab = remove exactly one `INDENT_STEP_SPACES` from every
> selected physical line. Same delta for every selected line, every
> time. No parent/child concept. No preceding-sibling/destination-list
> logic. No subtree movement. No marker-width-dependent target columns.
> No snapping to a parent's indentation. The parser alone decides what
> the resulting Markdown structurally means.

**Why this is not merely "another edge case to patch," and why §18.15's
fix — though itself correctly scoped and non-violating on its own
terms — is the wrong direction to keep building on**: every version of
the logical-target model, no matter how carefully the target arithmetic
was scoped to avoid touching unselected lines, was still *computing a
different delta for different selected lines based on their parsed
structural role* (a line's own marker width, its preceding sibling's
marker width, whether it was "first" or "established," its ancestor's
column). That is itself the thing being rejected — not because it ever
moved an unselected line (it didn't, at any point in §18–§18.15), but
because "one Tab = one uniform physical step for every selected line,
full stop" is the actual, simpler, permanently-settled product
requirement, and a hierarchy-aware target column can never be that,
regardless of how safely it's computed.

**Disposition**: the entire amendment above (§9's "AMENDED DECISION,"
originally approved after §18/§18.12 — implementing `logicalTabTarget`,
`logicalShiftTabTarget`, `contentColumnOf`, `precedingSibling`,
`existingNestedList`, same-container delta propagation, and the
`resultColumn` ancestor lookup) is **reverted in full**. `markdownIndentKeymap.ts`,
`markdownIndentKeymap.test.ts`, `markdownBulletBackspace.test.ts`, and
`markdownDeepBulletEnter.test.ts` are restored to their content as of
commit `b435f159` (the last commit before this amendment's own work
began) — confirmed via direct diff, byte-for-byte identical, not a
manual approximation. The "Final decision: uniform per-line
indentation" section immediately below is the active contract again,
for list and non-list lines alike, with no exception.

**What is preserved, and why**: §17 (the two structural Tab/Shift-Tab
hazards) and §18.1–§18.15 (the full logical-target investigation,
including its two genuinely-fixed bugs) are kept as historical record,
not deleted — they document real parser behavior, real formulas
(§18.2's content-column formula remains an accurate description of
CommonMark nesting math, independent of whether Clutter's own Tab
command uses it), and a real, instructive example of a design that
satisfied every constraint it was explicitly asked to satisfy and was
still the wrong direction. §16's ordered-list *numbering* investigation
is entirely unaffected by this reversion — it was already, and remains,
a separate, still-undecided question with no implementation.

### Final decision: uniform per-line indentation, no construct awareness (the active contract — reconfirmed 2026-08-30 after §18.16's reversion, for list and non-list lines alike)

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

### Caret mapping on Tab — IMPLEMENTED + VERIFIED (commit `b435f159`)

**Rule**: on Tab, the resulting selection must be mapped forward through
the transaction's `ChangeSet` (`assoc = 1`), not left to CM6's default
mapping (`assoc = -1`). This is a **generic selection-tracking rule**,
independent of construct — it applies identically to plain paragraphs,
blank lines, and every list-marker kind (bullet, ordered, task), because
`lineIndentChange` always inserts at the same relative position
(`line.from` through the line's own leading-whitespace end) regardless
of what follows it.

**Why it's needed**: `state.update({ changes, userEvent })` with no
explicit `selection` resolves the post-transaction selection via
`Transaction.newSelection`, which maps the *old* selection through the
change with CM6's own default `assoc = -1`. That default keeps a
collapsed caret sitting *behind* text inserted exactly at its own
position — correct for nothing this feature does, since Tab's insertion
point and a caret at true content-start (column 0, before any existing
indentation) coincide exactly in the one case that matters most: a
completely flush line. Confirmed both by direct `EditorState`
experimentation and by the shipped 45-test suite never once asserting
`view.state.selection` after Tab (only `doc.toString()`), which is
exactly why the two prior Tab/Shift-Tab commits (`967d0fb4`, `20ff06a5`)
never caught it.

**Fix** (`markdownIndentKeymap.ts`, `markdownIndentDirection`):

```ts
if (changes.length) {
  const changeSet = state.changes(changes);
  dispatch(
    state.update({
      changes: changeSet,
      selection: direction === 1 ? state.selection.map(changeSet, 1) : undefined,
      userEvent: direction === 1 ? 'input.indent' : 'delete.dedent',
    })
  );
}
```

Shift-Tab is deliberately left on the default mapping (`selection:
undefined`) — its changes are replacements/deletions rather than pure
insertions at the caret, so `assoc = -1`'s default already produces the
correct collapsed position in every tested case (caret at, inside, or
past the removed whitespace all collapse to the same, correct point).

**Verified** — both by 10 new regression tests added to
`markdownIndentKeymap.test.ts` (asserting `selection.main.head`/`from`/
`to`, not just document content: plain text at position 0, empty line at
0, bullet at 0, ordered list at 0, repeated Tab tracking forward on every
press, non-zero caret positions unaffected, Shift-Tab unaffected at and
inside the dedented run, and a multi-range/multi-line selection mapping
every touched range's own edges correctly) and live in the actual
Clutter webapp (typed probe characters immediately after Tab, at each of
the same positions, landing exactly where the fix predicts).

**Why this matters for future numbered/task-list work**: any future
list-kind-specific Tab/Enter/Backspace work that dispatches its own
transaction with `changes` inserting at a caret's own position inherits
this same default-mapping hazard unless it also sets an explicit
`selection` (or reuses `markdownIndentKeymap.ts`'s pattern above). This
is not a list-specific fix — it is a generic CM6 selection-mapping rule
this codebase must apply at every call site that inserts text exactly at
a collapsed caret's position, list or not.

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

### PENDING ADDENDUM (approved direction, 2026-08-29 — NOT YET IMPLEMENTED): ordered-list Tab/Shift-Tab normalization

**This is a decision about future scope, recorded here so §9's own
"uniform, construct-agnostic, whitespace-only" statement above is never
read as still-unconditionally-true without this qualifier once the
addendum ships.** Nothing below is implemented. `computeIndentChange`/
`lineIndentChange` are untouched and remain exactly as documented above,
with no changed behavior for the addendum to have shipped yet.

**The approved direction** (superseding §14.4's three-option framing —
see §14's own update below): if Clutter ever implements ordered-list
renumbering on Tab/Shift-Tab, it must **not** be "when an item becomes
newly nested, set its number to `1`." A structural move can affect two
distinct ordered-list runs at once — the list the item **left** (needs
its remaining sequence closed up) and the list it **joined** (which may
already have its own existing items, in which case the moved item should
continue that sequence, not restart it at `1`). The architecture, when
built, is two-phase:

1. **Phase A — unchanged.** `computeIndentChange`'s existing leading-
   whitespace-only edit runs exactly as it does today. This function is
   never modified by the addendum.
2. **Phase B — provisional post-indent state.** Before dispatching,
   build the state Phase A's change would produce (`state.update({
   changes })`, not yet dispatched) and read its `syntaxTree` — never
   the pre-edit tree, per this document's own repeated "the parser is
   stateless, ask it after the edit, never predict structure ahead of
   it" principle (§1, §7, §9's own text above).
3. **Detect actual `OrderedList` membership change.** For every
   explicitly-touched ordered-list item, compare its `OrderedList`
   ancestor identity in the pre-edit tree against the provisional
   post-edit tree (positions mapped forward through Phase A's own
   `ChangeSet` via `mapPos`, confirmed available on the installed
   `@codemirror/state@6.7.1`). Only a genuine membership change —
   never merely "the line's leading whitespace changed" — triggers
   Phase C. A Tab that doesn't yet cross the nesting threshold (§14.9's
   own measured windows) must produce zero numbering side effects.
4. **Phase C — conservative normalization, only when Phase B detects a
   real change.** Normalizes **both** the source run (closing the gap
   left behind) and the destination run (continuing its existing
   sequence if one exists, starting at `1` only if the destination is a
   genuinely new list). Mirrors `renumberList`'s own conservative
   policy (§14.1): only an already-sequential run is shifted; a
   deliberately irregular sequence (`1, 7, 42`) is never "repaired."
   Delimiter (`.` vs `)`) is preserved, never rewritten. Digit-width-
   changing rewrites for an item that owns descendant content are
   **deferred** pending the boundary-safety investigation this same
   session opened as a separate, prerequisite bug (see §14's update and
   "the Enter/`renumberList` digit-width corruption bug" below) — the
   addendum must not ship before that prerequisite is resolved, since
   Phase C's own normalization writes are exactly the kind of edit that
   bug demonstrates can corrupt structure if unguarded.
5. **Phase D — one transaction.** Phase A's `ChangeSet` and Phase C's
   normalization `ChangeSet` (computed against the Phase B provisional
   *document*, not the original) are combined via `ChangeSet.compose`
   (confirmed present and semantically exact for this — "if `this` goes
   docA→docB and `other` represents docB→docC, the result represents
   docA→docC," read directly from `@codemirror/state`'s own source) and
   dispatched as a single transaction — one undo step for both the
   indentation and the renumbering, a direct consequence of composing
   before dispatch rather than dispatching twice.

**Explicitly not a justification for this addendum**: portability to
strict CommonMark. An earlier draft of this document's own §14.2
overstated "a nested item reading `2.` is a valid list starting at 2" as
if renumbering to `1` would make Clutter's output more spec-compliant.
Verified directly against the installed parser this session: a nested
ordered list interrupting its parent's own open paragraph — the exact
shape a newly-Tab-nested item produces — accepts **any** starting number
without a blank line, not just `1` (`"1. A\n   5. B"` nests exactly like
`"1. A\n   2. B"`); only a *top-level* paragraph interruption requires
`1` in Clutter's own configured `@lezer/markdown@1.7.2`. Whether strict
CommonMark's spec text extends the same top-level-only restriction to
nested contexts was not conclusively established (a spec lookup
returned an unsupported claim either way) — but it doesn't matter for
Clutter's own purposes regardless: **the parser Clutter actually ships
already accepts a non-`1`-starting nested list**, so renumbering is a
pure editor-UX/product-policy decision, never a correctness fix, and
must not be described as one anywhere in this document going forward.

**Test/verification requirements, when built** (not exhaustive, see
§14's own updated test-matrix pointer): already-sequential destination
continues correctly; existing destination children are never
renumbered to collide with the moved item; source run closes its own
gap; deliberately irregular numbering is left alone; `.`/`)` preserved;
multi-line Tab (several items moved at once) normalizes the whole
affected run, not just one item; Shift-Tab uses the *same* normalization
planner as Tab (not a separate, ad-hoc inverse algorithm); mixed bullet/
ordered nesting only ever normalizes the ordered side; undo/redo revert
the whitespace and numbering changes together, as the single composed
transaction guarantees for free.

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

## 14. Ordered-list Tab nesting and renumbering — INVESTIGATED, NOT YET DECIDED, NOT IMPLEMENTED (2026-08-29)

**Status: investigation only.** Nothing in this section is implemented.
No code changed as part of this investigation. This section exists so a
future decision is made from recorded facts, not re-derived or guessed.

### 14.0 The premise needs a correction first

The scenario as commonly described — "Tab the second item, it becomes
nested under item 1 but keeps its old number" — is **not quite what
happens with a single Tab press** for a single-digit-numbered parent.
Verified directly against the installed parser, through the exact
production `markdownLanguageExtension()` config (not just the bare
grammar):

```
"1. Text\n  2. Text"   (ONE Tab = 2 spaces, Clutter's INDENT_STEP_SPACES)
```

parses as **two sibling `ListItem`s in the same top-level `OrderedList`**
— `"  2. Text"`'s own `ListMark` is still a direct child of the
*original* list, not a new nested one. The 2-space indent is real (it
renders visually shifted right, via the construct-agnostic
`leadingIndentDecoration.ts`), but it does **not** cross CommonMark's own
nesting threshold for a `"1. "`-prefixed parent, which requires the
continuation line's indent to reach the parent's own content column —
`3` for `"1. "` (2-char marker + 1-char separator). Only a **second** Tab
(4 spaces) crosses that threshold and produces genuine structural
nesting — confirmed:

```
"1. Text\n    2. Text"   (TWO Tabs = 4 spaces)
```

parses as `OrderedList > ListItem("1. Text") > OrderedList > ListItem("
2. Text")` — a real nested list, one child, with one stray leading space
inside it (` 2. Text` — harmless, the same kind of "indentation slop"
already tolerated elsewhere in this document, e.g. §9's own
`resolveLineIndentContext`/Tab model).

**This is itself a related, separate, pre-existing gap, not something
this investigation introduces**: Clutter's Tab step (`INDENT_STEP_SPACES
= 2`, §9) is a flat, construct-agnostic 2 spaces per press, chosen
deliberately over a construct-aware/marker-width-aware indent (§9's own
"investigated and rejected" construct-aware `markdownIndentContext.ts`
predecessor). For **bullets**, this happens to work perfectly in one
press, because a bullet's own content column (`"- "` = 2 chars) exactly
equals `INDENT_STEP_SPACES` — confirmed: `"- Text\n  - Text"` (one Tab)
nests immediately. For **ordered markers**, the content column varies
with digit count (`"1. "` = 3, `"10. "` = 4, `"100. "` = 5) and is never
equal to the flat 2-space step, so the number of Tab presses needed to
actually nest an ordered item is **inconsistent and marker-width-
dependent** — 2 presses for `"1."`–`"9."`, exactly 2 presses for `"10."`–
`"99."` (4 spaces happens to equal that content column exactly), 3
presses for `"100."`–`"999."`, and so on. This inconsistency exists
**independently of the renumbering question** and is not fixed or
addressed by any renumbering decision — flagging it here so it isn't
conflated with, or mistaken for evidence about, the renumbering question
itself.

The renumbering question below is therefore precisely scoped to: *once
enough Tab presses have crossed the nesting threshold and a line's own
`OrderedList` has become a new, genuinely nested list, should its sole
(or first) item's literal number be rewritten to reflect its new
position?* — not to "does Tab visually indent the line" (it always
does, correctly, per §9, regardless of nesting).

**§14.9–§14.16 (below, after §14.8) is a follow-up investigation session
that goes much deeper into exactly this "when does Tab genuinely create
nesting" question — the precise CommonMark rule, the exact measured
threshold for every marker width, a newly-discovered corruption-adjacent
edge case for 3+ digit markers, the three-concepts distinction the
renumbering discussion above only touches briefly, and an explicit,
undecided architecture question about whether §9's uniform-2-space
contract itself needs revision.** Read that section for the full,
citation-backed answer; §14.0's own summary above remains accurate but
is superseded in precision by §14.9's measurements.

### 14.1 Does CM6 / `@codemirror/lang-markdown` have built-in support for this?

**No — for Tab specifically. Yes, but unrelated, for Enter.**

Confirmed by reading the installed `@codemirror/lang-markdown` source
directly (`node_modules/@codemirror/lang-markdown/dist/index.js`):

- A `renumberList(after, doc, changes, offset)` function exists (line
  163) — it rewrites the literal digit run of every `ListItem` following
  a given node, so that each is the previous one's number + 1. It is a
  real, precedent-setting example of an upstream editing command
  legitimately rewriting ordinal digits as a side effect of maintaining
  a consistent sequence.
- It is called from exactly **three** sites, **all inside
  `insertNewlineContinueMarkupCommand`** (the Enter command, already
  wired as `continueMarkup` in `markdownEnterKeymap.ts`) — never from any
  indent-related code path. `@codemirror/commands`' own generic
  `indentMore`/`indentLess` (which Clutter doesn't even use — it has its
  own `markdownIndentKeymap.ts`) have no Markdown awareness at all, let
  alone renumbering.
- `deleteMarkupBackward` (Backspace, also read directly) never calls
  `renumberList` either.

**Conclusion**: CM6 has zero built-in renumbering tied to indentation
changes. The only renumbering CM6 does is Enter-triggered, and Clutter
already inherits that behavior for free (§13.6) without having written
any renumbering code of its own. If Tab-triggered renumbering is wanted,
Clutter would have to build it — there is no upstream primitive to
delegate to, though `renumberList`'s own approach (regex-extract the
digit run via `itemNumber`, replace with a computed value) is a proven,
reusable *pattern* even though the function itself isn't exported for
reuse (`itemNumber`/`renumberList` are both module-private in
`@codemirror/lang-markdown`'s bundle — confirmed via the package's
public `export` list, which only exposes `commonmarkLanguage,
deleteMarkupBackward, insertNewlineContinueMarkup,
insertNewlineContinueMarkupCommand, markdown, markdownKeymap,
markdownLanguage, pasteURLAsLink`).

### 14.2 What does CommonMark semantics actually say?

CommonMark does not require, recommend, or even discuss renumbering on
indentation change, because it has no concept of "indenting an existing
item" as an operation at all — it only defines how to parse whatever
literal text exists. What CommonMark *does* define, confirmed directly
against the parser (§13.1's own methodology, re-applied here):

- **A list's "start" is whatever number its first item literally has.**
  No renumbering, ever, by the parser, regardless of context — confirmed
  repeatedly in this document (§13.1's `"5. A\n5. B\n5. C"` finding, and
  directly here: a nested list whose sole item reads `"2."` is, per
  CommonMark, a real, valid list starting at 2 — if rendered to real
  HTML by a spec-compliant renderer, `<ol start="2">`, not `<ol
  start="1">`. Renumbering it to `1` on nesting is a *Clutter UX
  decision*, not a CommonMark correctness requirement, and — if
  implemented — would produce a **different serialized document** than a
  strict CommonMark round-trip would produce, in exchange for a UX
  convenience.
- **Changing delimiter style starts a new list.** `"1. A\n2) B"` parses
  as two separate `OrderedList`s (confirmed directly) — not relevant to
  the renumbering question itself, but confirms delimiter style (`.` vs
  `)`) is exactly as literal/preserved as the digits are.
- **Repeated/non-sequential numbers are always valid** at any nesting
  depth — `"1. First\n1. Text"` (two literal `"1."`s at the same top
  level, e.g. the result of nesting-in-then-dedenting-without-
  renumbering) is confirmed to parse as two ordinary sibling `ListItem`s,
  not an error, not a merge, not a warning condition of any kind.
- **A nested list interrupting its parent's own open paragraph accepts
  any starting number, not just `1`** — confirmed directly this session,
  correcting an earlier, over-general reading of "list interrupting a
  paragraph must start at 1": `"1. A\n   5. B"` nests exactly like
  `"1. A\n   2. B"` (no blank line needed either way) in Clutter's
  installed `@lezer/markdown@1.7.2`. Only a **top-level** paragraph
  interruption enforces the "must start at 1" rule (`"Text\n5. Item"`
  stays a single `Paragraph`, no list; `"Text\n1. Item"` does interrupt).
  A CommonMark spec lookup on whether the strict spec text extends this
  restriction to nested contexts too returned an unsupported/uncertain
  answer either way — irrelevant regardless, since **the parser Clutter
  actually ships already accepts the non-`1` nested case**, so no
  "portability to strict CommonMark" argument for renumbering survives
  this check: renumbering `2.`→`1.` on nesting would not fix a
  Clutter-parser compliance gap (there isn't one), only serve a UX
  preference. Any future proposal for the addendum above must not cite
  spec-portability as its justification.

**Conclusion**: nothing in CommonMark recommends the behavior the
original request wants. It is a reasonable *editor UX* convention (many
outliner-style editors visually restart nested numbering at 1), but it
is not a Markdown-semantics recommendation, and literal preservation
(Clutter's current behavior) is, if anything, the more strictly
CommonMark-faithful choice — this document takes no position on which
is more "correct" for Clutter's product, only that the two are
genuinely different values (interop fidelity vs. editor UX convention),
not a right-answer-vs-bug situation.

### 14.3 What does Clutter currently do?

Exactly what §9 already documents, unchanged: Tab (`lineIndentChange`)
computes and dispatches **only** `{ from: line.from, to: leadingEnd,
insert: ' '.repeat(target) }` — a pure leading-whitespace edit, for every
touched line, with zero syntax-tree awareness beyond
`resolveLineIndentContext`'s per-line classification (which doesn't
even feed into the indent computation itself for `list`/`paragraph`
lines — see `computeIndentChange`). It never inspects, computes, or
writes anything about a marker's own digits, for bullets or ordered
markers alike, and never has. There is no existing partial
implementation, no dormant code path, nothing "almost there" — the gap
is total, by original design (§9's own explicit, tested, Locked
decision to keep Tab construct-agnostic).

Concretely, for the exact scenario in the original request (confirmed
live, in the running Clutter webapp, via real keystrokes, not just the
parser probe above): typing `1. Text`, Enter, `Text` (continues as `2.`
via upstream auto-increment, §13.6), then two Tab presses on that second
item produces `1. Text` / `    2. Text` (4-space indent, genuinely
nested per §14.0, digits untouched) — the marker renders as `2.` inside
its own new nested list, exactly as the raw document text says, with no
special-casing anywhere in the render or edit path.

### 14.4 Recommended behavior — options, not a decision (SUPERSEDED — see §9's own "Pending addendum")

**Status update (2026-08-29): a direction has since been approved** —
recorded in §9's "PENDING ADDENDUM" subsection above, not implemented
yet. That direction is a genuine fourth option, not a selection among
A/B/C below: normalize **both** the source and destination `OrderedList`
runs a structural move actually affects (never just "set the moved item
to `1`," which B/C both still frame too narrowly — see §9's own addendum
for exactly why "existing destination children" and "the source list's
own gap" both need handling). The three options below are kept, unedited,
as the historical record of what was considered before that direction
was chosen — not because they're still live alternatives.

This document does not pick one; that is a product decision outside an
architecture investigation's scope. Recorded here so the decision, when
made, can cite this section rather than re-deriving it:

- **Option A — do nothing (status quo).** Literal preservation, matching
  every other "never invent content the user didn't type" rule in this
  entire document (§1, §7, §9, §12, §13.6). Cheapest, zero new risk,
  most CommonMark-round-trip-faithful. Cost: the nested item visually
  reads a number that doesn't match "first item of a list" convention,
  which is the exact discomfort the original request raises.
- **Option B — renumber the newly-nested first item to `1` on the Tab
  press that actually crosses the nesting threshold.** Addresses the
  original request literally. Requires Tab to write outside the leading-
  whitespace range for the first time ever (§14.5) and raises the
  symmetric Shift-Tab question (§14.6) and the multi-item-nested-at-once
  question (§14.7) that Option A doesn't have to answer.
- **Option C — renumber the whole newly-nested run relative to a new
  start of `1`,** not just a single fixed item, to also handle the case
  where *multiple* consecutive items are indented together in one
  multi-line Tab press (e.g. selecting `"2. B"`+`"3. C"` under `"1. A"`
  and Tabbing both at once) — a strict superset of Option B's scope, and
  the only one of the three that stays internally consistent for that
  case without a second, separate mechanism.

No sub-recommendation between B and C is made here without a product
decision on whether multi-line Tab is a case worth handling for this
specifically (§14.7) — flagged as the deciding factor, not resolved.

### 14.5 Does source modification violate Clutter's Tab architecture?

**At the level of "may any Clutter command write computed/derived digit
text into `state.doc`" — no, there is precedent and no blanket
prohibition.** Enter's own upstream `renumberList` behavior (§14.1),
which Clutter has knowingly kept wired and unmodified since the original
bullet-work sessions, already establishes that a list-editing command
legitimately computing and writing ordinal digits — not literally typed
by the user in that exact position — is accepted, working behavior in
this codebase today. §13.6 already documents and accepts this
distinction for Enter without treating it as a violation of "Markdown
source is canonical."

**At the level of "does this violate Tab's own specific, tested,
Locked contract" — yes, this would be a genuine, deliberate expansion,
not a small tweak.** §9 is explicit and repeatedly reinforced throughout
this document:

> "This function only ever computes and returns a change for the *one*
> line it was called with... List hierarchy... is a consequence the
> parser derives from the resulting source on the next reparse, not
> something this function tracks, preserves, or requires."

and the test matrix backing §9 (`markdownIndentKeymap.test.ts`) asserts,
line by line, that every Tab/Shift-Tab change is exactly one `{from,
to, insert}` triple bounded to `[line.from, leadingEnd)`. A renumbering
feature would need to dispatch a **second, distinct change range**
(the marker's own digit run, well past `leadingEnd`) in the same
transaction — a change Tab has never made, in any form, at any point in
this document's history, including the earlier, more construct-aware
`markdownIndentContext.ts` predecessor that §9 itself records as
"investigated and rejected" (that predecessor, even at its most
construct-aware, only ever computed indentation *position*, never wrote
to a marker's own text — this would go further than that rejected
version ever did).

**Conclusion**: implementing Option B or C is not blocked by any
absolute "never write to `state.doc` beyond whitespace" rule (no such
absolute rule exists in this codebase — Enter already disproves it), but
it does require deliberately, explicitly amending Tab's own specific,
tested, Locked contract in §9 — which this document's own operational
process (`docs/implementation-rules.md`) treats as exactly the kind of
change that needs a stated, explicit decision before implementation,
not a silent patch (§9's own contract is exactly the kind of "frozen
architectural invariant" `implementation-rules.md`'s Failure Conditions
section names as a stop-and-escalate trigger, not a judgment call to
make silently while implementing something else).

### 14.6 The Shift-Tab symmetric question (only relevant if B/C is chosen)

If a Tab-triggered renumber-to-`1` were implemented, dedenting that same
item back out (Shift-Tab) merges it back into its parent's own list as
an ordinary sibling. Confirmed directly: `"1. First\n1. Text"` (two
literal `"1."`s at the same top level — the exact shape produced by
dedenting a renumbered item without a matching Shift-Tab-side fix) is
valid CommonMark, parses as two ordinary sibling `ListItem`s, no error —
so nothing *breaks*, but the result is a numerically nonsensical
document (two first items) unless Shift-Tab also renumbers on the way
out (to, e.g., "previous sibling's number + 1", mirroring
`renumberList`'s own logic). **Not investigated further than this
structural confirmation** — whether this symmetric fix is required, or
whether Option A's "leave it as literal, cosmetic-only" tolerance
extends to this case too, is unresolved and explicitly deferred to
whichever decision resolves §14.4.

### 14.7 Multi-line Tab (only relevant if B/C is chosen)

Tab already supports indenting several explicitly-selected lines at once
(§9, tested extensively for bullets). If two or more consecutive ordered
items are selected and Tabbed together, they'd become several sibling
items in one new nested list (not one lone item) — Option B's "renumber
the one item" framing doesn't naturally cover this case; Option C's
"renumber the whole newly-nested run" does. **Not investigated
empirically in this session** (no probe run for this specific multi-line
shape) — flagged as a design question the eventual implementation must
resolve, not a confirmed parser fact like the rest of this section.

### 14.8 Smallest clean architecture, if B or C is chosen (design sketch only — not implemented)

Recorded so a future implementation starts from an evaluated shape
rather than a blank page, consistent with this document's own
established pattern (e.g. §6's Enter handlers, §8's Backspace handler)
of "guard narrowly, compute from the post-edit tree, never assume
structure ahead of the parser":

1. **Compute today's whitespace-only change exactly as `lineIndentChange`
   already does** — no change to that step.
2. **Determine the post-edit tree before dispatching, not by
   pre-computing structure from the pre-edit tree.** This document's own
   repeated, hard-won lesson (§1, §7, §9: "a structural fact about a
   document must not depend on how it was typed... the parser is
   stateless... indentation is derived from the resulting source on the
   next reparse") applies exactly here: whether a given Tab press
   actually crosses the nesting threshold for *this specific* marker
   width can only be known by asking the parser against the *prospective*
   post-whitespace-change document, never by computing it analytically
   from `getBulletMarkRange`/the ordered equivalent's own content-column
   math ahead of time — the same class of bug this whole document
   spent enormous effort avoiding elsewhere (§1's "why we do not modify
   Lezer/parser behavior," §7's rejection of typing-time interception).
   Concretely: build a candidate `EditorState` (or reuse
   `tr.state`/`state.update` against just the whitespace change) and read
   `syntaxTree` off *that*, not the original.
3. **Guard narrowly**: only consider a line whose own `ListMark` is
   `OrderedList`-parented, and only fire when the post-edit tree shows
   that `ListItem` is now the **first child** of an `OrderedList` that
   did not exist (at that position, wrapping that item) before this
   specific transaction — i.e., genuinely newly created by this Tab
   press, not an already-nested item being indented one level deeper
   inside an already-existing nested list (which should never be
   renumbered — it already has a legitimate position in an existing
   sequence).
4. **Reuse `itemNumber`-style regex extraction** (`/^(\s*)(\d+)(?=[.)])/`,
   matching `@codemirror/lang-markdown`'s own private helper's shape,
   confirmed via source reading in §14.1) to locate exactly the digit
   run to replace — never assume a fixed offset/width, since `"1."` vs
   `"10."` vs `"100."` have different digit-run lengths.
5. **Combine both changes into one `state.update({ changes: [...] })`
   and dispatch once** — a single undo step covering both the
   indentation and the renumbering, not two separate transactions (which
   would double the undo-history entries for what is conceptually one
   user action, breaking the "one Tab press = one undo step" expectation
   §9's own test matrix already locks in for the whitespace-only case).
6. **This is a genuinely new Tab code path, not a `computeIndentChange`
   tweak** — `computeIndentChange`'s own contract (single line, single
   change, whitespace-only, confirmed by its own doc comment and return
   type) should stay exactly as it is; a renumbering feature is an
   additional, separate step layered after it, not a modification to it,
   so that every existing caller/test of `computeIndentChange` itself
   remains completely unaffected regardless of whether renumbering ships.
7. **Before writing any of this**, per §14.5's own conclusion: amend
   §9's stated contract explicitly (a short, dated addendum recording
   the decision and its scope — mirroring how §13.5 recorded the
   Backspace-symmetry decision), so `docs/implementation-rules.md`'s own
   "preserve every public contract... unless the specification itself is
   amended first" rule is satisfied before, not after, implementation.

None of the above has been built. This is a design sketch for a
decision that has not yet been made (§14.4).

### 14.9 CommonMark's exact rule for the required indentation — INVESTIGATED, cited against the primary spec

Two genuinely separate CommonMark rules govern the shapes probed in this
follow-up investigation, confirmed both empirically (a fresh set of
parser probes, swept exhaustively per marker width) and against the
CommonMark spec (v0.31.2) text directly, not from memory:

- **Rule #4 ("Indentation")**: a list marker itself may be preceded by
  **up to three spaces** and still start a valid new item — "the result
  of preceding each line of *Ls* by up to three spaces of indentation...
  also constitutes a list item with the same contents and attributes."
  This is an **absolute cap of 3, independent of the parent's own marker
  width** — it governs how much a *new* marker line may be indented and
  still be recognized as starting a fresh item (a sibling, if it's
  immediately after another item of the same list; a wholly separate new
  list if the marker kind/delimiter differs — §13.1, §14.10).
- **Rule #1 ("Basic case")**: a list marker of width *W* (the marker's
  own characters — `"1."` → *W*=2, `"10."` → *W*=3, `"100."` → *W*=4;
  confirmed this is character count of the marker glyph run only, not
  including the separator) followed by 1–4 spaces of indentation *N*
  requires continuation content to be indented by *W + N* spaces to
  remain **inside** that item as a nested block. The practical minimum
  (one canonical separator space, *N*=1) is *W*+1 — confirmed empirically
  to match this document's own "content column" (§1, §2): 3 for `"1. "`,
  4 for `"10. "`, 5 for `"100. "`.
- **Rule #5 ("Laziness")**: once a paragraph is open inside a list item,
  a following line may have **less** indentation than the item's own
  required column and still be treated as plain continuation text of
  that open paragraph (not a new block, not list-structured, not
  requiring any particular indentation at all) — this is the exact
  mechanism behind the "gap" phenomenon in §14.11 below, not a special
  case invented by this investigation.

**The two thresholds (0–3 for a new marker, ≥*W*+1 for nested content)
are independent numbers that do not always meet.** For `"1."`/`"10."`
(*W*+1 = 3 or 4), they're adjacent or overlapping — every indentation
amount is classified as either "new sibling" or "nested," with no gap.
For `"100."` and wider (*W*+1 ≥ 5), there is a **real gap**: indentation
amounts from 4 up to *W* (exclusive of the nesting threshold) are
**neither** a valid new sibling **nor** nested content — Rule #5's
laziness swallows them into the *preceding* item's own open paragraph
instead. See §14.11 for the measured boundaries per marker width and why
this matters concretely for Clutter's own 2-space Tab step.

### 14.10 `@lezer/markdown` parsing of the requested probe matrix — IMPLEMENTED + VERIFIED (fresh probes, this session)

All probes run against the exact production `markdownLanguageExtension()`
grammar for the earlier, single-shot cases and the bare `markdown({
addKeymap: false })` config (equivalent for this purpose — §13.1 already
established Clutter's custom extensions never touch list-nesting
mechanics) for the exhaustive sweeps below, since a fresh, targeted
throwaway script is easier to sweep with the bare config and the two are
confirmed identical for every list-related case tested throughout this
document.

**`1. A` → indent `2. B`, swept 0–8 spaces** (content column 3):

| Spaces | Result |
|---|---|
| 0–2 | Sibling `ListItem` in the same top-level `OrderedList` (within Rule #4's 0–3 tolerance) |
| 3–6 | Genuinely nested: new child `OrderedList` inside item 1, sole item `"2. B"` (content column 3, tolerance window extends to column+3 = 6) |
| 7+ | Lazy-continuation: `"2. B"` is swallowed as literal text of item 1's own `Paragraph` (`"A\n       2. B"`) — no `ListItem`, no `ListMark`, for the second line at all |

**`10. A` → indent `2. B`, swept 0–9 spaces** (content column 4):

| Spaces | Result |
|---|---|
| 0–3 | Sibling (within the 0–3 tolerance) |
| 4–7 | Nested (content column 4, window extends to 7) |
| 8+ | Lazy-continuation |

**`100. A` → indent `2. B`, swept 0–10 spaces** (content column 5) — **this is where the two thresholds stop meeting**:

| Spaces | Result |
|---|---|
| 0–3 | Sibling (the 0–3 tolerance is unchanged — absolute, not scaled to marker width) |
| **4** | **Neither** — lazy-continuation of item 1's paragraph (`"A\n    2. B"`), confirmed directly: `listItemCount` drops from 2 to 1, the second line's own `"2. B"` text is absorbed with zero list structure of its own |
| 5–8 | Nested (content column 5, window extends to 8) |
| 9+ | Lazy-continuation again |

**`1000. A`/`10000. A`, swept for confirmation** (content columns 6, 7): the gap widens exactly as predicted by Rule #4's fixed 3-space cap vs. Rule #1's marker-width-scaled column — gap = `[4, contentColumn − 1]`, width = `contentColumn − 4`. Confirmed: 2 gap positions (4–5) for `"1000."`, 3 gap positions (4–6) for `"10000."`. **This gap exists for every marker with 3 or more digits** (content column ≥ 5, i.e. numbers 100 and above) — not a corner case limited to one specific width.

**Nested ordered → bullet** (`"1. A"` + indented `"- B"`, content column 3): identical threshold to same-kind nesting — 0–2 spaces stays a **wholly separate, independent top-level `BulletList`** (not a sibling within the `OrderedList` — different marker *kind* never produces a same-list sibling, confirmed distinctly from the same-kind case, matching §13.1's "changing delimiter starts a new list" finding generalized one step further: changing *kind* does too, unconditionally, at any under-indentation); 3+ spaces nests the bullet inside item 1's `OrderedList` `ListItem`, same mechanism, same threshold, only the child's own node names differ (`BulletList`/`ListItem`/`ListMark` "-" instead of `OrderedList`/`ListItem`/`ListMark` "2.").

**Nested bullet → ordered** (`"- A"` + indented `"1. B"`, content column 2): symmetric — 0–1 spaces produces a separate top-level `OrderedList` (not a "sibling" of the bullet item, since bullets have no numbered-sibling concept and different kinds never share a list regardless); 2+ spaces nests.

**Conclusion**: the nesting threshold is governed **entirely by the parent item's own content column** (Rule #1, *W*+*N*) regardless of what kind of marker the child uses — mixing kinds changes what happens on *under*-indentation (a wholly separate list, not a sibling) but not the *nesting* threshold itself, which is identical to the same-kind case.

### 14.11 `@codemirror/lang-markdown`'s own indentation logic — INVESTIGATED, read directly from the installed source

Confirmed by reading `node_modules/@codemirror/lang-markdown/dist/index.js` directly (not inferred from behavior):

- The grammar registers exactly **one** `indentNodeProp` entry:
  `indentNodeProp.add({ Document: () => null })`. There is **no**
  per-node indent computation for `ListItem`, `OrderedList`, or
  `BulletList` anywhere in the package. This is the generic CM6
  `getIndentation()` facet (what `indentOnInput`/`insertNewlineAndIndent`
  would consult for automatic "match the context" indentation) — for
  Markdown, it is a blank slate beyond "Document itself has no opinion."
  Clutter doesn't rely on this facet at all (`markdownIndentKeymap.ts`
  and `markdownEnterKeymap.ts` fully replace the relevant default
  bindings — already documented in §6/§9), so this absence has zero
  practical effect on Clutter today, but it does definitively answer
  "does upstream provide an indent-service Tab could consult": no.
- The **actual** required-content-column computation lives in a
  module-**private** `Context` class and its `getContext()` function
  (already read in full during the §13/§14 investigation) — `Context.to`
  is exactly the content-column position, computed via a per-line regex
  match (`/^( *)\d+([.)])( *)/` for ordered, a parallel one for bullets)
  against that specific line's own text. This is used **only** by
  `insertNewlineContinueMarkupCommand` (Enter) and `deleteMarkupBackward`
  (Backspace) — never by any indent-command path, confirmed by grep
  (§14.1 already established `renumberList`'s call sites are Enter-only;
  the same is true of `Context`/`getContext` more broadly — every call
  site is inside those same two exported commands).
- **Neither `Context` nor `getContext` is exported** from the package
  (confirmed against its public `export` list, §14.1) — there is no way
  for Clutter to import and reuse lang-markdown's own private
  implementation even if it wanted to; any reuse has to be an
  independent reimplementation, not a shared import.

### 14.12 Does CM6 have a reusable "required content column" concept?

**Not as a ready-made indent-service API a Tab command could simply
call.** But the *information* is fully derivable, and — critically —
**Clutter already derives and has it**, independently of
`lang-markdown`'s own private `Context` class: `getListMarkRange(node,
state)` in `listMarkerDecoration.ts` (§2, generalized to ordered markers
in §13) returns exactly `{ from, to }` where `to` **is** the content-
column position for that specific `ListItem` — the same value
`lang-markdown`'s own `Context.to` computes, arrived at independently
(via the syntax tree's own `ListMark`/`nextSibling` boundary, not a
regex re-scan of the line text the way `lang-markdown`'s private version
does it). This is not a duplicate-logic problem in the
`ARCHITECTURE_RULES.md` rule-5 sense (§13.2 already invokes that rule for
a different function) — it's two independent implementations of the same
CommonMark fact, one upstream-private, one already shipped in Clutter's
own codebase for an unrelated purpose (marker decoration), that happen
to agree. **If Tab-side nesting-threshold logic is ever built, it should
call `getListMarkRange(...).to` (minus the line's own `.from`, for a
column) — not reimplement a third regex, and not attempt to reach into
`lang-markdown`'s private `Context`, which isn't reachable anyway.**

### 14.13 Three distinct concepts — measured, not conflated

Explicitly separated per the request, because the codebase keeps them in
three unrelated places today and nothing currently connects any two of
them:

| Concept | Where it lives | What it actually is | Varies with digit count? |
|---|---|---|---|
| **Visual marker-column width** | `MarkdownEditor.css`, `.cm-bullet-list-marker`/`.cm-ordered-list-marker` (§2, §13.4) | A CSS pixel value (`--marker-width`, 20px `width`/`min-width`) — purely a rendering-layer concept, has no relationship to character counts at all | No — it's a floor in *pixels*, not characters; a wide marker's *box* grows (§13.4), but this token itself never changes |
| **Parser's required content column** | `@lezer/markdown`'s own grammar (structural fact, not Clutter code) + independently computed by `getListMarkRange(...).to` (`listMarkerDecoration.ts`) and by `lang-markdown`'s own private `Context.to` | A **character-count** column on one specific physical line — `marker width (W) + separator width (N, 1–4)`, per Rule #1 (§14.9) | **Yes** — 3 for `"1. "`, 4 for `"10. "`, 5 for `"100. "`, ... |
| **Tab step size** | `markdownIndentContext.ts`, `INDENT_STEP_SPACES = 2` | Clutter's own arbitrary editing-UX constant — a flat, per-press character count, chosen for uniformity (§9), never read by or connected to either of the other two | No — always exactly 2, by explicit design (§9) |

**Confirmed by tracing, not asserted**: no import, no shared constant, no
function call connects any two rows of this table today. The CSS token
(row 1) is consumed only by `MarkdownEditor.css`'s own selectors. The
content-column value (row 2) is consumed only by
`listMarkerDecoration.ts`'s decoration/query functions and
`markdownEnterKeymap.ts`'s Enter/Backspace commands (§6, §8, §13). The
Tab step (row 3) is consumed only by `markdownIndentKeymap.ts`. Their
numeric agreement for bullets (row 3's `2` happens to equal row 2's `2`-
component-of-3... actually row 2 for bullets is content column `2`
exactly, matching row 3's `2` exactly, §14.0) is coincidence, not a
designed relationship — there is no code path that would keep them in
sync if either changed independently (e.g. if `INDENT_STEP_SPACES` were
ever changed to 3, bullet nesting would *stop* working in one press,
with nothing in the codebase to notice or warn).

### 14.14 Should the uniform 2-space Tab policy remain completely uniform?

**Findings only — no decision made here, per the request.**

The case *for* keeping it uniform (i.e., Option "leave §9 exactly as-is"):
§9's own investigation of an earlier, construct-aware
`markdownIndentContext.ts` predecessor found it "produced byte-identical
results to plain CM6 `indentMore`/`indentLess` in every tested case
except two narrow, cosmetic ones," and that a genuinely stronger
guarantee ("indenting list lines without the parser ever reclassifying
them") was "found to be not achievable at all while staying valid
CommonMark." If a future construct-aware Tab redesign is evaluated
against *that same finding*, it would need to explain why this case is
different.

**It is different, concretely, and this session's own measurements are
the evidence**: the earlier rejection predates ordered lists' own
rendering/editing entirely (§13's own work) and its "bought nothing
durable" finding was never tested against ordered-marker-width-dependent
nesting thresholds, because there was no ordered-list feature to test it
against at the time. This session found two concrete, non-cosmetic
consequences specific to ordered lists that the earlier investigation
could not have evaluated:

1. **Inconsistent press-count to reliably nest** (§14.0, §14.10): 2
   presses for 1–2 digit markers, 3 for 3-digit markers, and so on,
   unlike bullets' reliable single press.
2. **A genuine data-shape hazard, not merely a UX inconsistency**
   (§14.9's Rule #5 gap, §14.10's `"100."`/`"1000."`/`"10000."` sweeps):
   for any 3+-digit ordered marker, **exactly landing on 2 Tab presses
   (4 spaces) — Clutter's own step size — silently absorbs the intended
   child item into the *parent's own paragraph* as plain text**, not
   merely "fails to nest." The child's own `ListMark`/`ListItem`
   structure is **destroyed**, not deferred — a user pressing Tab twice
   on a line under a `"100."`-`"999."` parent does not get "not yet
   nested, press Tab again" (Option A's implicit assumption); they get a
   line that is no longer a list item *at all*, merged into the
   preceding paragraph's own text, until edited back out. This was not
   previously documented anywhere in this ODR and is a materially
   different, more severe class of finding than "the numbering is
   wrong."

Whether finding (2) alone is severe enough to justify revisiting §9's
uniformity decision specifically for ordered lists (as opposed to, say,
a narrower fix that only prevents Tab from ever landing exactly in the
Rule #5 gap, without making Tab fully construct-/width-aware) is the
open architectural question this section surfaces — not answered here.

### 14.15 UX comparison — A (flat, current) vs. B (nests in one press)

Recorded as a comparison, not a recommendation, per the request:

**A — current, flat 2-space Tab, unaffected by construct**:
```
1. Parent
  2. Child        (after 1 Tab — still a sibling, not nested)
```
requires a second Tab (4 spaces total) to actually nest, and — per
§14.9/§14.10 — for 3+ digit markers, that same second Tab press can
instead silently destroy the child's own list-item structure (§14.14).
Consistency: uniform behavior across every construct (§9's own stated
value), at the cost of ordered lists specifically not behaving the way a
user pressing Tab once would likely expect (nothing else in this editor
requires 2 presses to "do the thing Tab visually suggests already
happened" — the visual indent renders immediately on the first press
regardless of whether real nesting occurred, which is itself a
source of the mismatch between what's shown and what's true structurally).

**B — marker-width-aware, nests in exactly one press**:
```
1. Parent
  1. Child        (would need construct-aware step sizing to reach the exact content column in one press — this specific rendering choice is a *renumbering* question, not an indent-mechanics one; the mechanics-only version of "B" would show "2." here, only the *step size* changes, not the digits — see §14.0's own scoping note)
```
would require Tab's own step size to vary per line, computed from that
line's *own governing parent's* content column (via §14.12's
`getListMarkRange(...).to`) rather than a flat constant — a genuinely
new, construct-aware code path, not a tweak to `INDENT_STEP_SPACES`'s
value (raising it to 3 or 4 would fix single-digit ordered lists but
immediately break bullets' own reliable one-press nesting, since row 3
of §14.13's table would no longer coincidentally match row 2 for *either*
kind uniformly). Benefit: Tab always "does what it visually shows" in
one press, for every marker width, and structurally eliminates the
Rule #5 gap hazard (§14.14) entirely, since a width-aware step would
jump directly to the correct content column rather than sweeping through
the dangerous 4-spaces-exactly case for 3+ digit markers.

### 14.16 Does this violate the existing Tab contract, or does the contract need revision?

This is a **different specific clause** of §9's contract than the one
§14.5 already examined for renumbering. §14.5 asked "may Tab write
outside the line's own leading-whitespace range" (relevant only to
*renumbering*, Option B/C). This section asks a narrower, logically prior
question: **may Tab's own *step size* — how many spaces one press adds —
vary by construct or by a specific line's own marker width**, while
still only ever writing to that line's own leading-whitespace range (no
digit-rewriting at all, orthogonal to §14.5).

§9 states its contract explicitly: *"every physical document line...
gets the same `INDENT_STEP_SPACES` (2) added to... its own leading
whitespace, **independently of every other line and regardless of what
construct it is** — no paragraph/list/heading/blockquote/code
distinction, no syntax-tree lookup..."* A Tab whose step size depends on
whether the touched line sits under an ordered-list parent, and *which*
ordered marker width that parent has, is **definitionally** a violation
of "independently of... regardless of what construct it is" and "no
syntax-tree lookup" — even though it would never touch a byte outside
the leading-whitespace range (so it does *not* violate the narrower,
separate "whitespace-only" invariant §14.5 examined). These are two
independently violable clauses of the same section, and a width-aware
step size would violate only the first, not the second.

**Conclusion, mirroring §14.5's own structure**: implementing Option B
of §14.15 is not blocked by any absolute "Tab must never look at the
syntax tree" rule stated elsewhere in this codebase in general terms —
`resolveLineIndentContext` (used today, by Tab itself, for
classification, and by the Enter/Backspace handlers) already does
syntax-tree lookups from the "Tab-adjacent" code path, so the
*mechanism* of consulting the tree from indent-related code is not
itself new or forbidden. What would be new is Tab's own step-size
computation depending on that lookup's result — a direct amendment to
§9's own quoted contract sentence above, not an implementation detail
within it. Per `implementation-rules.md`'s own operational contract, this
is exactly the shape of change that needs a stated, dated decision (a
short addendum to §9, analogous to how §13.5 amended the Backspace
contract) before any code is written — not something to implement as a
"fix" without first updating the sentence in §9 that the fix would
otherwise silently contradict.

---

## 15. Existing bug: Enter/`renumberList` digit-width corruption

**Status: IMPLEMENTED + VERIFIED (both directions).** This is an
**already-shipped defect**, entirely separate from the not-yet-built
Tab/Shift-Tab normalization addendum (§9's "PENDING ADDENDUM", §14) —
surfaced as a byproduct of investigating that future feature, but
present today in code Clutter has never modified: upstream
`@codemirror/lang-markdown@6.5.2`'s own `insertNewlineContinueMarkupCommand`
(wired unmodified as `continueMarkup` in `markdownEnterKeymap.ts`) and
its private `renumberList` helper. §15.1–§15.4 below cover the growth
direction (the first-found case, fixed and verified in an earlier
session); §15.5 onward cover the shrink-direction follow-up
investigation (2026-08-29) that closed the remaining gap the growth-only
fix had left open, and a further refinement (found during that same
follow-up) to stop the fix from being more aggressive than the actual
hazard requires.

### 15.1 Confirmed reproduction (growth direction) — IMPLEMENTED + VERIFIED

```
Before:  "8. A\n9. B\n   1. Child"     (child correctly nested under "9.")

Press Enter at the end of "A" — ordinary list continuation, no Clutter
code involved beyond delegating to upstream's own continueMarkup.

After:   "8. A\n9. \n10. B\n   1. Child"
```

`renumberList` correctly bumps the following sibling's number (`9.`→
`10.`, to keep the sequence consistent after a new item is inserted
before it) — but `"10."`'s own content column is one column wider than
`"9."`'s, and the child's indentation (3 spaces, unchanged) is now
insufficient. Result, confirmed via direct parse-tree inspection: the
nested `OrderedList` under item "B" is **destroyed** — `"1. Child"`
becomes a bare top-level sibling `ListItem` in the same list as A/9/10/B,
not nested under B at all. Renumbering is a pure text rewrite with zero
awareness of descendant content; the corruption is an emergent
consequence of composing that rewrite with Lezer's own (correct,
unrelated) indentation rules on the next reparse — **not a bug in either
component individually**, per this document's own established
methodology for classifying this kind of finding (§14.9's identical
framing for the Rule #5 laziness "gap").

### 15.2 Investigation (growth direction) — IMPLEMENTED + VERIFIED

**How `renumberList` decides when to renumber** (read directly from the
installed `@codemirror/lang-markdown@6.5.2` source): `itemNumber(item,
doc)` regex-extracts a leading digit run (`/^(\s*)(\d+)(?=[.)])/`,
applied to the first 10 characters of the item's own text) and converts
it through a bare `+match[2]` (`Number(...)`) — **losing any leading-zero
padding immediately**, before any renumbering decision is even made.
`renumberList(after, doc, changes, offset)` then walks `after` and its
`nextSibling`s at the *same tree level only* (never recursing into
nested lists): the first node is the anchor (its own literal number is
read but never rewritten); each subsequent sibling is rewritten to
`String(prev + 2 + offset)` **only if** its own current literal number
already equals `prev + 1` — the walk stops at the first non-sequential
sibling it finds, a real, working conservative guard, just one that has
no concept of "sequential" beyond the bare numeric value and no concept
of "safe" beyond that.

**When a renumber can cross a digit-width boundary** — confirmed to be
broader than "crossing a power-of-10 numerically": any rewrite where
`String(newNumber).length !== oldLiteralDigitRun.length`. Two
independent causes, both verified directly:
1. **Numeric boundary crossing** — `9→10`, `99→100`, `999→1000`, all
   confirmed live with nested content, all three reproducing the
   identical corruption class.
2. **Leading-zero padding loss** — `"008."` (4 chars) renumbers to
   `"9."` (2 chars) even though `8→9` doesn't cross a numeric power-of-10
   boundary at all. Confirmed live: `"007. A\n008. B\n     1. Child"` (child
   at the correct 5-space content column for `"008."`, genuinely nested
   in the pre-edit tree) + Enter after `A` → `"008."` stays literal
   `"008."` under the shipped fix (protected); without the fix, the same
   input renumbers to `"9."` and destroys the nested child exactly like
   the numeric-boundary cases.

**Confirmed present with**: both `.` and `)` delimiters (identical
corruption, delimiter correctly preserved either way); direct child
lists; multiple descendants (all flattened together, not just the
first); multiple nested levels (a child's own grandchild subtree stays
internally correct but the whole subtree gets dragged to the wrong
level); multiple following siblings after the boundary (same-width
siblings past the corrupted one renumber correctly and independently —
the corruption is isolated to the one item whose width actually
changed, not "everything downstream"); arbitrary (non-1-based) starting
sequences (`95→96` crossing to `97` when the parent chain reaches
3-digit width later behaves identically to a `1`-based sequence — the
mechanism has no special-case for where a sequence starts).

**Two distinct failure modes**, both confirmed, both explained by this
document's own already-established indentation-threshold model (§14.9):
whether a corrupted child gets **flattened to a top-level sibling**
(`9→10` case: the child's stale indentation now falls within
CommonMark's 0-3-space "new marker" tolerance relative to the wider
parent) or **silently absorbed as lazy-continuation text** of the
renumbered item's own paragraph (`99→100`/`999→1000` cases: the stale
indentation now lands in the "neither sibling nor nested" gap §14.9
measured for a different, Tab-driven scenario) depends purely on exactly
how far short the child's *old* indentation falls of the *new* content
column — the same formula, not a second mechanism.

**Root cause classification**: confirmed to be an **interaction**, not a
defect in either component alone. `renumberList` is a pure, correct (by
its own narrow contract) text substitution with zero knowledge of
indentation or descendant content. Lezer's own indentation rules are
separately correct and unrelated to renumbering. The corruption is an
emergent property of composing them: `renumberList`'s edit lands
correctly, and Lezer's reparse then correctly (per its own unrelated
rules) reinterprets a child's already-existing, unrelated-line
indentation against the *new* width — exactly the same framing this
document already uses for the Rule #5 "gap" finding in §14.9.

**Shrink direction and the other two call sites**: `renumberList` has
three internal call sites, all inside `insertNewlineContinueMarkupCommand`
— the ordinary continuation case investigated and fixed above, plus two
more inside the "empty item unwinds one level" branch (Clutter's own
`nonTightLists: false` configuration means this branch always fires on
an empty-item Enter), one of which passes `offset: -2` (a
shrink-direction rewrite). All three call the *same* shared function, so
the identical risk applies to all three by construction — but a clean,
minimal, independently-confirmed **shrink-specific** corruption
reproduction proved fiddly to construct this session (every attempted
construction either didn't actually cross a digit-width boundary, or hit
`renumberList`'s own pre-existing "stop at first non-sequential number"
guard for an unrelated reason before reaching a width-crossing rewrite
at all). This is recorded as a genuine, honest investigation gap — see
`markdownEnterRenumberGuard.test.ts`'s own closing comment — not papered
over with an inconclusive test. The shipped fix protects this path
identically in principle (verified by reading its own implementation:
it inspects only the final `ChangeSet`, with no branch that inspects
which internal `continueMarkup` decision produced a given change), just
not independently confirmed with a passing/failing before-fix
regression test the way the growth-direction cases are.

**Other Enter cases where renumbering changes the parse tree**: none
found beyond the three `renumberList` call sites already covered — no
other Clutter or upstream Enter code path rewrites ordinal digit text.

### 15.3 The fix (initial version — see §15.6 for a later refinement)

**Smallest safe fix, per the stated constraints (no redesign of Enter's
list behavior, no wholesale replacement of CM6's renumbering policy, no
Tab-specific logic, all existing correct behavior preserved)**:
`continueMarkupPreservingStructure` (`markdownEnterKeymap.ts`) wraps
`continueMarkup` — it does not reimplement, replace, or second-guess
`renumberList` in any way. It captures the transaction `continueMarkup`
would have dispatched (via a substitute `dispatch` that intercepts
rather than commits it — the same capture-and-inspect technique this
codebase's own test helpers already use), inspects that transaction's
own `changes` via `ChangeSet.iterChanges`, and for each individual
change asks: does this exact `[fromA, toA)` range match some
`ListMark`'s own digit run (`[marker.from, marker.to - 1)`, confirmed
exact via `renumberList`'s own position math) in the *pre-edit* tree,
and does that `ListMark`'s own `ListItem` span more than one physical
line (a cheap, conservative proxy for "owns descendant content that
could be indentation-calibrated to the current width" — a single-line
item, `ListMark` + one short `Paragraph` and nothing else, has nothing
that could fall out of alignment, so its own digit-width changes are
always safe regardless of magnitude).

If no such risky rewrite exists among the transaction's changes — the
overwhelming majority of Enter presses in an ordered list, including
every ordinary renumber that never crosses a width boundary and every
width-crossing renumber where the affected item has no descendants —
the original, unmodified transaction is dispatched exactly as
`continueMarkup` alone would have produced it. **Byte-identical
behavior for every case that doesn't hit this specific hazard.**

If a risky rewrite is found, the wrapper drops it and every change after
it in document-position order (`renumberList`'s own walk is strictly
position-ascending, so "after" is well-defined) — keeping every edit
before it exactly as upstream computed — and dispatches a new
transaction built from that reduced change list. The declined item (and
any later siblings that depended on its own renumbering continuing) is
left numerically non-sequential rather than structurally corrupted — a
deliberate choice, not an oversight: this document's own standing
principle (§1, §7, §13.6) is "never silently author a document shape the
user didn't ask for," and a duplicate/non-sequential number is a far
smaller, purely cosmetic consequence than a destroyed nested list. The
wrapper makes **no attempt to repair** the resulting numeric gap (e.g.
via compensating whitespace shifts on descendant lines) — that class of
fix is exactly the kind of new, deliberately-designed editing behavior
the ordered-list-normalization addendum (§9/§14) is scoped to consider
separately, not something to fold into a narrow corruption guard.

The selection position is reused directly from the *original,
unmodified* transaction's own resolved head (`transaction.state.selection.main.head`)
— valid for the reduced transaction too, since every dropped change sits
strictly after that position in the document (renumbering only ever
touches *later* siblings), so the document up to and including the
cursor's own resting point is byte-identical between the full and
reduced versions.

Wired at the same position `continueMarkup` previously occupied in
`markdownEnterCommand`'s own `||` chain — no other handler in that chain
is touched, and Tab/Shift-Tab (`markdownIndentKeymap.ts`) and Backspace
(`deleteBulletMarkerSeparator`) are entirely untouched by this fix.

### 15.4 Test coverage (growth direction, initial — superseded by §15.8's final count)

`markdownEnterRenumberGuard.test.ts` (new file, 12 tests, all passing):
the confirmed `9→10`/`99→100`/`999→1000` boundaries with nested children
(structure survives in every case, verified via `OrderedList` node
count in the resulting tree, not just document text); paren-style
markers (structure survives, delimiter never flips to `.`); the
leading-zero-padding-loss case (verified against a fixture whose child
is genuinely nested in the *pre-edit* tree — an earlier draft of this
test used an under-indented fixture that was already lazy-continuation-
absorbed before any edit, which doesn't exercise the guard at all and
was corrected once the mistake was caught by a failing assertion, not
silently adjusted); multiple descendants; multiple nested levels
(grandchild survives inside its own still-correct child); multiple
following same-width siblings past the boundary (renumber independently
and correctly); the safe cases — no width change, no ordered list at
all (bullets), single-line item with a width change and no descendants
to protect (still renumbers, matching unmodified upstream exactly),
plain end-of-list Enter — all asserted byte-identical to pre-fix output.

**Full verification performed**: document source (asserted per test, not
just "handled"); resulting Lezer tree/list hierarchy (`OrderedList`
node-count assertions, not just visual inspection); Enter behavior
(the dedicated new test file plus the full pre-existing
`markdownEnterKeymap.test.ts`/`markdownDeepBulletEnter.test.ts`/
`markdownBulletBackspace.test.ts` suites, unaffected); undo/redo (the
fix dispatches exactly one transaction per Enter press, identical to
unmodified `continueMarkup`, so undo/redo behavior is structurally
unchanged — not independently re-tested beyond the pre-existing Tab/
Enter undo coverage elsewhere in this document, since nothing about the
fix's transaction-dispatch shape differs from what that coverage already
exercises); the full `features/markdown` test suite (1221 tests, 59
files, all passing — up from 1199 before this session, the 22 new tests
being this file's own 12 plus 10 unrelated pre-existing additions from
an earlier, separately-committed Tab caret-mapping fix already present
in the working tree at the start of this investigation); `tsc --noEmit`
clean; and live, direct verification in the running Clutter webapp
(typed `8. A` / Enter / `B` / Enter / dedented to `1. Child` at the
correct nested column, confirmed visually nested with its own
fold-indicator on `9. B`, then clicked to end-of-`A` and pressed Enter —
the document became `"8. A\n9. \n9. B\n   1. Child"`, exactly matching
the automated test's own expectation, with the nested child still
visibly indented under `9. B` and its fold-arrow still present,
confirming the fix's effect end-to-end, not just at the `state.doc`
level).

### 15.5 Shrink-direction investigation — IMPLEMENTED + VERIFIED (2026-08-29 follow-up)

**How `renumberList`'s shrink call site is reached**: two of its three
internal call sites (§15.2) sit inside `insertNewlineContinueMarkupCommand`'s
"empty item unwinds one level" branch — reached whenever Enter is pressed
on an empty list item, which `nonTightLists: false` (Clutter's own
configuration) makes unconditional. One of those two calls passes
`offset: -2`, decrementing the *deleted* item's own remaining list —
confirmed live by construction, not merely by reading the source: typing
`9. X`, Enter, `Y`, Tab×2, `Child` (nesting `Child` under `Y`), then
deleting `X` and pressing Enter on the now-empty `9.` item, renumbers
`10. Y` down to `9. Y` in the real, running Clutter webapp, with `Child`
staying visibly nested.

**Reproduced the confirmed corruption, deliberately, before checking
whether the existing (growth-only) guard already handled it**: a
programmatic sweep, deleting a zero-padded `"9"`-valued empty item
whose following sibling is the equivalent `"10"`-valued item at
increasing padding widths (content columns 4 through 9), each with a
descendant at that sibling's own *correct* pre-edit content column —

| digits | old content col. | new content col. (always `"9."` = 3) | delta (shrink magnitude) | descendant survives (raw, unguarded `continueMarkup`) |
|---|---|---|---|---|
| 1 (`9`/`10`) | 4 | 3 | 1 | ✓ nested |
| 2 (`09`/`10`) | 4 | 3 | 1 | ✓ nested |
| 3 (`009`/`010`) | 5 | 3 | 2 | ✓ nested |
| 4 (`0009`/`0010`) | 6 | 3 | 3 | ✓ nested |
| 5 (`00009`/`00010`) | 7 | 3 | 4 | ✗ absorbed as lazy-continuation text |
| 6 (`000009`/`000010`) | 8 | 3 | 5 | ✗ absorbed |
| 7 (`0000009`/`0000010`) | 9 | 3 | 6 | ✗ absorbed |

**Confirmed, precisely, not assumed**: the safe/unsafe boundary is
**magnitude ≤ 3 safe, magnitude ≥ 4 unsafe** — an exact match for the
same tolerance-window constant this document's own §14.9 already
established for a different (Tab-driven) case (a physical line stays
inside a list item's own nested block for indentation from that item's
content column up to 3 columns past it; beyond that, CommonMark's Rule
#5 laziness absorbs it as plain continuation text). This is the same
constant reappearing in a second, independently-discovered context, not
a coincidence requiring its own separate explanation — shrinking an
item's content column by *M* has the identical effect on a stale
descendant's relative indentation as widening it would, just with the
sign reversed, so the identical tolerance window governs both
directions.

**Also confirmed**: pure numeric shrinks with no zero-padding (`10→9`,
`100→99`, `1000→999`) are *always* magnitude-1 shrinks (a single-item
deletion only ever changes a sequential run's digit count by the amount
the literal numbers themselves differ by, and consecutive integers
differ by exactly 1 digit only at a power-of-10 boundary) — always
within the safe tolerance, confirmed for all three boundaries. The
*dangerous* magnitudes only arise from zero-padding (a padded marker's
lexical width is decoupled from its numeric value, so `renumberList`'s
own `Number(...)`-and-`String(...)` round-trip can drop far more
characters than the numeric shift alone would suggest) or, in principle,
from a multi-item deletion in one operation (not independently tested
this session — CM6's own empty-item-unwind branch only ever removes one
item per Enter press, so this scenario cannot arise via Enter at all;
flagged as **NOT YET INVESTIGATED**, not assumed safe, should it ever
become reachable by some other future editing operation).

### 15.6 Refinement: the existing guard already covered shrink, but was more aggressive than necessary — IMPLEMENTED + VERIFIED

Checking the confirmed-corrupting shrink cases (§15.5's table, magnitude
≥4) against the *already-shipped* guard (§15.3, unmodified) found it
**already declines every one of them** — `isRiskyRenumberRewrite`
inspects only the final `ChangeSet`, cross-referenced against the
pre-edit tree, with no branch that inspects which of `continueMarkup`'s
internal decisions (ordinary continuation vs. either empty-item-unwind
call) produced a given change, so the growth-direction fix already
protected the shrink direction **by construction**, verified directly
via the real `markdownEnterCommand`, not merely inferred from the code's
own shape.

**But inspecting the exact `ChangeSet` `continueMarkup` produces (per
this investigation's own required step) found the *original* guard was
itself more aggressive than the stated invariant allows.** For
`"8. A"` + Enter with `"9. B"` (owns a child, risky) followed by
`"10. C"`/`"11. D"` (no descendants, individually safe), upstream's own
transaction contains three independent changes — the new-item insertion,
`"9"`→`"10"` (risky), and `"10"`→`"11"` (safe, unrelated to B) — confirmed
by direct `ChangeSet.iterChanges` inspection, reproduced exactly as
`renumberList`'s own source predicts (§15.2). The original guard's
"stop at the first risky change and drop everything after it" strategy
declined **all three** of B, C, and D's rewrites, even though C and D's
own renumbers are independently safe and have nothing to do with B's
own descendant. This directly violates the stated invariant — "preserve
upstream Enter behavior everywhere except where upstream renumbering
would demonstrably corrupt an existing Markdown structure" — for C and
D specifically.

**Fix**: `continueMarkupPreservingStructure` now evaluates every change
in the transaction independently (no early-exit `corrupting` flag) and
skips *only* the specific rewrites `isRiskyRenumberRewrite` flags,
keeping every other change — including a later, unrelated sibling's own
safe renumber — exactly as upstream computed it. This is sound because
each renumbering edit targets an independent, non-overlapping digit-run
position, and `renumberList` itself already computes every rewritten
value from each sibling's own *original* literal number, never from
another rewrite in the same walk — so which subset of edits ends up
applied has no bearing on whether any individual one remains correct on
its own. The selection-reuse logic (`transaction.state.selection.main.head`)
needed no change: every renumbering edit, risky or not, targets a
position strictly after the cursor's own resting point (the always-kept
primary insertion), so the document up to and including that point is
identical regardless of which later edits are kept or dropped.

**Also refined the digit-width classification itself** to match §15.5's
asymmetric findings precisely, rather than treating any width change on
a multi-line item as uniformly risky:
- **Growth** (`insertedLength > oldWidth`): always risky for a multi-line
  item — unchanged from §15.3's original reasoning. A descendant
  authored at exactly the old content column (the common case — nothing
  in this codebase or upstream ever leaves intentional slack there) has
  zero margin against any growth at all; this function doesn't attempt
  to measure a descendant's *actual* slack, which would require
  inspecting the specific descendant range rather than the cheap
  "does this item span more than one line" check — investigated and
  judged not worth the added complexity for a case (deliberately
  slack-authored list content) this session found no evidence of.
- **Shrink** (`insertedLength < oldWidth`): risky only when the
  magnitude exceeds `MAX_SAFE_SHRINK_COLUMNS` (3, named directly after
  the constant this section's own investigation confirmed, not a magic
  number). A safe-magnitude shrink is no longer declined at all.

### 15.7 Regression comparison — IMPLEMENTED + VERIFIED

Representative cases, current (fixed) Clutter behavior vs. unmodified
upstream `continueMarkup`:

| Case | Upstream (unguarded) | Clutter (guarded) | Guard's effect |
|---|---|---|---|
| `1. A` + Enter, `2. B` follows (no width change) | `1. A / 2. / 3. B` | identical | none — safe, untouched |
| `8. A` + Enter, `9. B` follows, no descendants | `8. A / 9. / 10. B` | identical | none — nothing to protect |
| `8. A` + Enter, `9. B` (has child) follows | `8. A / 9. / 10. B / [child flattened]` | `8. A / 9. / 9. B / [child intact]` | declines B's own rewrite only |
| same, with safe `10. C`/`11. D` after | `... / 11. C / 12. D` (C, D also shifted) | `... / 11. C / 12. D` (identical) | **none for C/D** — confirmed independently kept, not dropped as collateral (§15.6) |
| Empty-item unwind, `10. Y` (has child) follows, safe magnitude | `[unwind] / 9. Y / [child intact]` | identical | none — safe shrink, unaffected |
| same, unsafe magnitude (heavy zero-padding) | `[unwind] / 9. Y / [child absorbed]` | `[unwind] / 00010. Y / [child intact]` | declines Y's own rewrite |

**The invariant holds**: every declined rewrite is one this session
independently reproduced as corrupting via the raw, unguarded upstream
command; every other case — including ones adjacent to a declined
rewrite in the same transaction — is byte-identical to unmodified
upstream.

### 15.8 Test coverage (final) — IMPLEMENTED + VERIFIED

`markdownEnterRenumberGuard.test.ts`: **21 tests, all passing** (12 from
the original growth-direction session, 9 added this session). New
coverage: plain numeric shrinks (`10→9`, `100→99`, `1000→999`, magnitude
1, all renumber correctly with descendants intact); the exact boundary
(magnitude 3 safe and renumbers, magnitude 4 unsafe and declines, both
directly on the boundary rather than deep in either region); paren-style
delimiter for both a safe and an unsafe shrink; an unsafe shrink with no
descendant content (renumbers normally, nothing to protect); and the
"skip-only, not truncate" property from §15.6, made an explicit
assertion (a declined middle sibling no longer suppresses later,
independently-safe siblings' own correct renumbers). The original
leading-zero-padding growth test was corrected once the refined guard's
own more-precise classification revealed it was actually a *safe*
magnitude-2 shrink, not risky growth as originally (incorrectly)
labeled — the test's expectation was updated to the verified-correct
behavior, not adjusted to preserve a stale expectation.

**Full verification, this session**: `tsc --noEmit` clean; the full
`features/markdown` suite (1230 tests, 59 files, all passing — up from
1221 before this session); live, direct verification in the running
Clutter webapp of a representative safe shrink (typed `9. X`, Enter,
`Y`, Tab×2, `Child`, deleted `X`, pressed Enter on the now-empty `9.`
item — `10. Y` correctly renumbered to `9. Y` with `Child` staying
visibly nested, fold-arrow intact); the confirmed-unsafe cases were not
separately re-verified live this session beyond the automated tests
(already directly reproduced live for the growth direction in the
original session, §15.1) — an **ACCEPTED LIMITATION** of this session's
own verification depth, not a claim that live verification would show
anything different from the automated tests, which do assert tree
structure, not just document text.

### 15.9 What remains genuinely open after this session

- **Multi-item deletion in one operation** (§15.5) — not reachable via
  Enter (CM6's own empty-item-unwind only ever removes one item per
  press), so not investigated. **NOT YET INVESTIGATED.**
- **Descendant-slack-aware growth handling** (§15.6) — a growth is
  currently always treated as risky for a multi-line item, even though a
  descendant with pre-existing extra indentation (slack) could in
  principle tolerate some growth safely. Investigated as a design option
  and explicitly not built: it would require inspecting the specific
  descendant's own indentation rather than the cheap "spans multiple
  lines" check, for a scenario (deliberately over-indented list content)
  this session found no evidence is common enough to justify the added
  complexity. **INVESTIGATED + REJECTED** for this pass, not a gap
  silently left unconsidered.
- **This bug's relationship to Backspace/`deleteMarkupBackward`** — Read
  directly (§15.2): `deleteMarkupBackward` never calls `renumberList`.
  Confirmed to have zero exposure to this defect, not merely assumed.
- **This fix is a prerequisite for, but does not implement, the
  Tab/Shift-Tab ordered-list-normalization addendum** (§9's "PENDING
  ADDENDUM", §14) — that feature's own Phase C would introduce new
  renumbering writes of the same general shape this section's fix
  protects against; nothing in *this* session implements, sketches
  further, or otherwise advances that separate, still-unbuilt feature.

---

## 16. Ordered-list Tab/Shift-Tab numbering — policy investigation (2026-08-30)

**Status: INVESTIGATED. NOT IMPLEMENTED. No code changed in this
session** — `computeIndentChange`/`lineIndentChange`
(`markdownIndentKeymap.ts`), `continueMarkupPreservingStructure`
(`markdownEnterKeymap.ts`), and the Markdown grammar are all exactly as
§9/§15 left them. This section records parser findings, the resulting
product-policy options, a recommendation, a proposed (unbuilt)
implementation architecture, and a proposed (unbuilt) test matrix, per
an explicit investigation-only request. Versions probed: `@codemirror/state
6.7.1`, `@codemirror/lang-markdown 6.5.2`, `@codemirror/view 6.43.9`,
`@codemirror/commands 6.11.0`, `@codemirror/language 6.12.4`,
`@lezer/markdown 1.7.2` — identical to every other version cited
elsewhere in this document; no drift.

### 16.1 What Lezer actually considers one `OrderedList` vs. two — IMPLEMENTED + VERIFIED

All confirmed via fresh probes against `markdownLanguageExtension()`
(the exact production config), not inferred from indentation alone:

- **Numeric value is irrelevant to list membership.** `"1. A\n2. B\n3. C"`,
  `"5. A\n6. B\n7. C"`, and `"1. A\n7. B\n42. C"` are each **one**
  `OrderedList` with three ordinary sibling `ListItem`s — confirmed
  directly. Whether a run "looks sequential" has zero bearing on
  whether the parser treats it as one list; that's a numbering
  question, not a structural one, and this document's own §13.1/§14.1
  already established the same fact from the Enter side.
- **Delimiter change always splits the list**, confirmed both
  directions (`"1. A\n2) B\n3. C"` and `"1) A\n2. B\n3) C"`): three
  **separate** `OrderedList` nodes, one per delimiter run, even with no
  blank line between them and even though every item is still at the
  same top-level indentation.
- **A blank line between same-delimiter items does not split the
  list** — `"1. A\n\n2. B"` is still one `OrderedList` (CommonMark's own
  loose-list allowance).
- **A paragraph separated by a blank line does split the list** —
  `"1. A\n2. B\n\nParagraph\n\n1. C\n2. D"` produces two independent
  `OrderedList`s with a `Paragraph` node between them.
- **A paragraph with *no* blank line does not split the list at all** —
  it is absorbed as lazy-continuation text of the preceding item's own
  `Paragraph`, and the line after it (`"1. C"` in the tested fixture)
  becomes a **third sibling `ListItem` of the same original list**, not
  a new one. Confirmed directly: `"1. A\n2. B\nParagraph\n1. C"` is one
  `OrderedList` with three items, the second one's own `Paragraph`
  reading `"B\nParagraph"`. This is the one case where the surface
  appearance most resembles the Obsidian screenshot's "paragraph breaks
  the list, next block restarts at 1" behavior — but the parser's own
  structural fact is the *opposite* of a break: no new list exists here
  at all in Clutter's own parse tree.
- **A bullet marker or blockquote marker splits the list immediately**,
  no blank line required — `"1. A\n2. B\n- Bullet\n3. C"` produces an
  `OrderedList` (two items) followed by an independent `BulletList`
  (whose own `Paragraph` absorbs `"3. C"` as its own lazy-continuation
  text, itself confirming numbers don't "resume" a different list kind
  either). `"1. A\n2. B\n> Quote\n3. C"` behaves identically with
  `Blockquote` in place of `BulletList`.
- **Nested lists are always their own independent node**, regardless of
  kind or depth — confirmed for ordered-in-ordered (2 and 3 levels
  deep), ordered-in-bullet, and bullet-in-ordered, matching this
  document's own §13.1 finding generalized with fresh, direct probes
  rather than assumed to still hold.

**Conclusion for the eventual normalizer**: "which `OrderedList` a
`ListItem` belongs to" must always be read from the actual tree
(`node.parent` walk to the nearest `OrderedList`), never inferred from
adjacency, blank lines, or apparent numeric sequence — exactly the
"ask the parser, never assume" principle this document has applied
everywhere else (§1, §7, §9, §14.9). Nothing here contradicts or
requires revising that principle; this section only confirms it holds
for the specific boundary questions a future normalizer would need to
answer.

### 16.2 Real Tab/Shift-Tab tree transitions — IMPLEMENTED + VERIFIED

All probes ran the actual, currently-shipped `markdownIndentMore`/
`markdownIndentLess` (`markdownIndentKeymap.ts`) against
`markdownLanguageExtension()` — not a bare grammar stand-in, and not a
hypothetical future command.

- **One Tab never nests an ordered item, regardless of parent width** —
  re-confirmed directly through the live command (previously only shown
  against the bare grammar in §14.9/§14.10): 1 Tab (2 spaces) on `"2.
  B"` under `"1. A"`, `"10. A"`, `"100. A"`, or `"999. A"` leaves `B` a
  top-level sibling every time.
- **Two Tabs (4 spaces) produce three different outcomes depending on
  the parent's own content column** — this is the single most
  important confirmation in this section, because it means "did Tab
  actually nest the item" is not a yes/no question answerable from Tab
  press count alone, exactly as §14.9 already established, now
  re-verified against the real command with zero renumbering involved:
  - Parent `"1."`/`"10."` (content column 3 or 4): `B` becomes
    genuinely nested (`OrderedList` inside `A`'s own `ListItem`).
  - Parent `"100."`/`"999."` (content column 5): `B` is **not** nested
    and **not** a sibling — it is absorbed as lazy-continuation text of
    `A`'s own `Paragraph` (`Paragraph:"A\n    2. B"`). This is §14.9's
    Rule #5 "gap" reproducing *without any renumbering at all* — pure
    Tab, on a pristine document, lands exactly in the gap for any
    3+-digit parent at exactly 2 presses. Already flagged as the
    highest-priority open item in this document (Open Questions item 8,
    §14.14); this session's contribution is direct confirmation via the
    live command rather than the bare-grammar probe alone.
- **Multi-line Tab genuinely moves every selected item into one shared
  new nested list together**, with each item's own literal number
  untouched: selecting `B`+`C` (from `"1. A\n2. B\n3. C\n4. D"`) and
  pressing Tab twice nests both as siblings of a new `OrderedList`
  under `A`, reading `"2."`/`"3."` verbatim; selecting `B`+`C`+`D` nests
  all three together the same way, leaving `A` as the sole remaining
  top-level item.
- **Selecting a list's own first item together with later items produces
  a degenerate, non-nesting result — a genuinely hazardous edge case,
  not previously documented.** Tab-ing `A`+`B` together (both lines
  selected) twice does *not* nest `B` under `A`; it re-indents `A`
  itself by 4 spaces. Because Clutter's grammar removes `IndentedCode`
  (`markdownGrammarExtensions.ts`), a document-initial line indented 4+
  spaces does not fall back to a code block the way strict CommonMark
  would — it is still recognized as the `OrderedList`'s own `ListMark`,
  just with 4 spaces of leading slop before it, and `B` (still just
  `"2. B"` on its own line, similarly over-indented) is absorbed as
  lazy-continuation text of `A`'s own `Paragraph` rather than becoming
  its own list item at all. **This means a future normalizer's
  membership-change detector must check that an affected item is still
  a genuine `ListItem` after the edit, not merely that its `OrderedList`
  identity changed** — this specific case self-resolves under that
  check (there is no valid destination `OrderedList` membership to
  normalize into, since `B` isn't a `ListItem` anymore), but only if the
  detector is built to notice the difference rather than assuming every
  Tab-selected line is still list-structured afterward.
- **Joining an existing destination list works correctly, in document
  order, with literal numbers preserved** — Tab-ing `B` (from `"1.
  A\n    1. Existing\n2. B\n3. C"`) twice correctly inserts `B` as
  `Existing`'s own new sibling inside the pre-existing nested
  `OrderedList`, `B`'s own literal `"2."` completely untouched.
  Confirmed the ordering is purely document-position-driven, not
  semantic: when the pre-existing destination item instead appears
  *after* the newly-nested one in source order, the newly-nested item
  becomes the nested list's own first item and the pre-existing one
  becomes its second — the parser has no concept of "which one arrived
  first," only textual position, which any normalizer must treat as
  the sole ordering authority.
- **Shift-Tab on a *complete* nested group re-attaches every item
  correctly as top-level siblings, literal numbers preserved** —
  dedenting `B`+`C` together (from `"1. A\n    1. B\n    2. C\n2.
  D"`) produces `A`/`B`("1.")/`C`("2.")/`D`("2.") as four ordinary
  top-level `ListItem`s in one `OrderedList`, no corruption.
- **Shift-Tab on only *part* of a nested group is a second, genuinely
  hazardous edge case — also not previously documented.** Dedenting
  only `B` (leaving `C` in place, from the same starting document)
  produces `A`(unchanged) / a new top-level `ListItem` for `B` reading
  `"  1. B\n    2. C"` — **`C` has been absorbed into `B`'s own
  `Paragraph` as lazy-continuation text**, losing its own `ListItem`/
  `ListMark` identity entirely. This is structurally the same *shape*
  of defect §15 fixed for Enter (a sibling's own descendant losing its
  list-item-hood because of an edit to something else nearby), but
  reached through Shift-Tab's own uniform, per-line, selection-scoped
  mechanics (§9) rather than through digit-width renumbering — `C` was
  never renumbered at all here; it was simply left at its old
  indentation while `B`'s own new indentation changed the *context* `C`
  is interpreted relative to. **This is a pre-existing hazard in
  today's shipped Shift-Tab, unrelated to ordered-list numbering, not
  discovered or introduced by this investigation's own subject matter**
  — flagged here because the request asked for a thorough multi-selection
  investigation and this is a genuine finding it surfaced, not because
  it is in scope to fix in this phase (see §16.12).

### 16.3 `renumberList`'s policy, as precedent (recap — not re-derived)

Already fully characterized in §15.2 from the Enter investigation, not
repeated in depth here: walks siblings at one tree level only, uses
each sibling's own *original* literal number (never a just-rewritten
one) to check `next == prev + 1`, stops at the first discontinuity,
never touches delimiters, and never reproduces zero-padding (converts
through a bare `Number`). This is the *policy* worth copying — "only
extend an already-sequential run, stop at the first break, never
invent a fresh sequence over irregular numbers" — not the private
function itself, which remains unexported and unreachable regardless
(§15.2 already confirmed this via the package's own public `export`
list).

### 16.4 Numbering semantics for Tab specifically — IMPLEMENTED + VERIFIED (by construction)

Arbitrary starting numbers, zero-padding, and the 9-digit CommonMark
maximum need no fresh probing for **today's shipped Tab**: `lineIndentChange`
(`markdownIndentKeymap.ts`) only ever produces `{ from: line.from, to:
leadingEnd, insert }` — a change strictly bounded to a line's own
leading-whitespace run, never touching anything at or after the marker
itself. Every numbering peculiarity a document already contains is
therefore preserved by Tab/Shift-Tab today as a direct, structural
consequence of that function's own scope, not something that needs
separate verification per case. This is the current, "Option A"
baseline the rest of this section evaluates alternatives against.

### 16.5 Width-boundary interaction with a future normalizer — IMPLEMENTED + VERIFIED (the constraint), design NOT YET DECIDED

§15's own Enter fix establishes the load-bearing fact any Tab
normalizer must inherit: **rewriting a digit run can itself change a
`ListItem`'s content column**, and doing so can destroy an unrelated
descendant's own structure if that rewrite crosses more than 3 columns
of width change (§15.5's confirmed boundary) or grows the width at all
on a multi-line item (§15.6's asymmetric finding). A future Tab
normalizer's own Phase C (§9's "PENDING ADDENDUM") would perform
exactly this class of write — renumbering a source or destination
list's items — and so **must** apply the identical safety check
(`isRiskyRenumberRewrite`'s own logic, or an equivalent re-derivation of
it) before committing any digit rewrite, not just before committing an
indentation change. This document takes no position here on whether
the normalizer should literally reuse `isRiskyRenumberRewrite` (it is
currently a Enter-keymap-local, unexported function) or re-derive an
equivalent check in its own module — that is an implementation-time
decision, not a policy one, deferred to whenever this feature is
actually built.

### 16.6 Proposed policy options, evaluated

**Option A — literal Markdown (today's shipped behavior).** Tab/Shift-Tab
change only whitespace; numbers are exactly as authored, including
after a genuine nesting-level change. Cost: a freshly-nested `"2. B"`
under `"1. A"` reads `"2."`, not `"1."`, which is the discomfort the
original request (this document's own §14) raised. Benefit: zero new
risk, zero new code, most CommonMark-round-trip-faithful (§14.2's
already-established finding that literal preservation is, if anything,
the more strictly spec-faithful choice survives unchanged by this
session).

**Option B — conservative auto-numbering**, per the approved general
direction (§9's addendum): normalize only when the post-edit tree
proves an explicitly-touched item's `OrderedList` identity genuinely
changed (§16.1/§16.2's own findings give the exact vocabulary for "genuinely
changed" — including the §16.2-confirmed need to also verify the item
is *still a `ListItem` at all*, not just check its ancestor identity);
identify the specific source and destination lists; normalize only an
already-sequential run within each (mirroring §16.3's `renumberList`
precedent); preserve delimiter always; preserve arbitrary starts and
zero-padding *except* where the normalization's own arithmetic requires
writing a new number (at which point §16.5's width-safety check gates
whether that specific write is even attempted); never touch bullet
markers; share one planner between Tab and Shift-Tab (§16.2's own
findings show both directions produce symmetric, mirror-image
membership changes — a shared planner is structurally justified, not
just convenient).

**Option C — stronger editor-style numbering** (Obsidian-like, e.g.
continuing an outer sequence across an intervening nested block, or
restarting a sequence after any paragraph break regardless of blank
lines). **Not evaluated as a serious candidate this session** — per the
explicit instruction not to build it without a strong architectural
reason, and because §16.1's own findings show the underlying parser
model doesn't naturally support several of the Obsidian behaviors
observed (a paragraph with no blank line doesn't structurally break the
list at all in Clutter's parser, so "restart numbering after a
paragraph" would require *inventing* a break the parser itself doesn't
recognize — a much larger, more speculative undertaking than Option B,
and one this session found no evidence Clutter's product goals actually
require).

### 16.7 Recommendation

**Option B**, matching the stated preference, is validated rather than
merely assumed: every one of its eight stated conditions (§16.6) has a
direct, confirmed grounding in this session's own probes or in §15's
already-shipped work — none of them are aspirational or unverified
premises. The one genuine open risk Option B inherits and must budget
for explicitly is §16.2's two newly-surfaced hazards (partial-selection
Shift-Tab, and first-item-included-in-selection Tab) — neither is
caused by numbering, both predate this feature, and both would need to
be either fixed independently first or explicitly handled by the
normalizer's own "is this still a valid `ListItem`" guard (§16.2's own
proposed resolution for the second one; the first one has no proposed
resolution here at all — see §16.12).

### 16.8 Proposed implementation architecture (design only — nothing built)

Exactly the approved shape from §9's addendum, restated here with the
specific hooks this session's findings pin down:

1. **Phase A — unchanged.** `computeIndentChange`/`lineIndentChange`
   produce exactly the whitespace edits they do today. Not modified.
2. **Phase B — provisional post-edit state**, built the same way §9's
   addendum already specifies (`state.update({ changes })`, not
   dispatched), with `ensureSyntaxTree` covering at least the affected
   region before Phase C reads it — deferred to implementation time
   whether the *whole* provisional document needs coverage or just the
   affected lines' own containing blocks; not decided here.
3. **Phase C — membership + validity check, per explicitly-touched
   item**: for each `ListItem` the selection actually touched (not
   "every line in a visual subtree" — §9's own uniform, per-line model
   is unchanged), map its pre-edit `ListMark` position forward through
   Phase A's `ChangeSet` (`mapPos`, confirmed available, §14's own
   citation) and confirm in the provisional tree that (a) the mapped
   position still resolves to a `ListMark` at all (§16.2's
   first-item-hazard finding — if not, skip this item entirely, nothing
   to normalize), and (b) whether its nearest `OrderedList` ancestor's
   own identity (start position) differs from before. Only case (b)
   being true triggers normalization for that item.
4. **Phase C continued — plan normalization** for every distinct
   source/destination `OrderedList` a touched item's membership change
   implicates, using §16.3's conservative "only extend an
   already-sequential run" policy independently for each, and gating
   every individual digit rewrite through §16.5's width-safety check
   before including it in the plan.
5. **Phase D — one transaction.** Compose Phase A's `ChangeSet` with
   Phase C's normalization `ChangeSet` via `ChangeSet.compose` (§9's own
   addendum already cites the exact semantics) and dispatch once.

**Explicitly not decided here**: whether Shift-Tab's own two
newly-surfaced hazards (§16.2) should be fixed as part of building this
feature, before it, or left as a separately-tracked, independent bug —
this is a scope/sequencing decision for whoever approves the eventual
implementation, not something this investigation resolves.

### 16.9 Proposed test matrix (design only — nothing implemented)

Organized by the request's own checklist, cross-referenced to which
cases this session already has direct parser/command evidence for
(marked ✓) versus which are net-new implementation-time obligations
once Option B is actually built (marked —, meaning "no normalization
exists yet to test," not "untested"):

| Case | Structural evidence this session | Normalization behavior |
|---|---|---|
| First nesting transition (1 Tab, no membership change) | ✓ §16.2 | — no-op expected |
| Second Tab, genuine nesting | ✓ §16.2 | — new item, plan `1.` or continue destination |
| Second Tab, lands in the Rule #5 gap (3+-digit parent) | ✓ §16.2 | — must detect "no longer a ListItem" and skip |
| Shift-Tab, complete nested group | ✓ §16.2 | — plan source-list closing normalization |
| Shift-Tab, partial group (hazard) | ✓ §16.2 (pre-existing bug) | — must not be silently "fixed" by the normalizer as a side effect |
| Single item Tab/Shift-Tab | ✓ §16.2 | — |
| Multi-item selection (2, 3 items) | ✓ §16.2 | — plan whole affected run together, not per-item |
| Existing destination list | ✓ §16.2 | — continue destination's own sequence, don't reset to `1` |
| Empty destination (genuinely new list) | ✓ §16.2 (the base nesting case) | — start at `1` only here |
| Source-list renumbering after departure | not directly probed this session | — NOT YET INVESTIGATED |
| Arbitrary starts (`5,6,7`) | ✓ (Tab preserves unconditionally, §16.4) | — must preserve start, only close internal gaps |
| Irregular numbering (`1,7,42`) | ✓ §16.1 (one list regardless) | — must not "repair," per §16.3's policy |
| `.` delimiter / `)` delimiter | ✓ §16.1 (both split lists identically; Tab preserves either unconditionally) | — never rewrite the delimiter |
| Mixed bullet/ordered nesting | ✓ §16.1/§16.2 | — normalizer must never touch a `BulletList`'s own markers |
| Separate ordered lists (delimiter-split) | ✓ §16.1 | — normalizer must never conflate two lists sharing a delimiter coincidentally |
| Paragraph-separated lists (blank line) | ✓ §16.1 | — confirmed genuinely separate; no cross-list normalization expected |
| Paragraph, no blank line | ✓ §16.1 (does not split at all) | — no separate case; already one list |
| Width boundaries (9→10, 99→100, etc.) | ✓ §15 (Enter), §16.5 (the constraint) | — must reuse or re-derive the identical safety gate |
| Zero-padding | ✓ §15 (Enter) | — must reuse or re-derive the identical width-from-literal-length computation |
| 9-digit maximum | ✓ §14.1 (confirmed the parser's own cutoff) | — normalizer must never generate a 10-digit marker |
| Undo / redo | not directly probed this session (Phase D's one-transaction design implies single-step undo, same reasoning as §15.8) | — NOT YET INVESTIGATED, but low-risk given the composed-transaction design |
| Cursor / selection mapping | not directly probed this session | — NOT YET INVESTIGATED |
| One transaction | design-level only (§9's addendum, §16.8) | — NOT YET INVESTIGATED empirically |
| Paste/load/source-preservation consistency | not directly probed this session | — NOT YET INVESTIGATED |

### 16.10 What remains genuinely open — NOT YET INVESTIGATED

- **The two newly-surfaced Tab/Shift-Tab hazards (§16.2)** — partial-
  selection Shift-Tab destroying a left-behind sibling's own list-item
  structure, and first-item-inclusive Tab producing a degenerate,
  non-list result. Neither is fixed, scoped, or assigned to a phase by
  this document yet.
- **Source-list-side normalization mechanics specifically** — §16.2
  confirmed the *structural* fact that Shift-Tab-ing a group correctly
  re-attaches it with literal numbers preserved, but no probe this
  session specifically exercised "the departure leaves a gap in the
  source list that a normalizer would need to close" against a live
  before/after numbering scenario (as opposed to Enter's own
  `renumberList`, which already does exactly this for its own,
  unrelated trigger). **NOT YET INVESTIGATED.**
- **Undo/redo, cursor/selection mapping, and paste/load consistency**
  for the proposed feature — all design-level only, none empirically
  probed against a real (even prototype) implementation, because none
  exists yet.
- **Whether `isRiskyRenumberRewrite` should be extracted/shared or
  re-derived** for the normalizer's own use (§16.5) — an
  implementation-time decision, not a policy one, explicitly deferred.

---

## 17. Tab/Shift-Tab structural corruption — investigated, not implemented (2026-08-30)

**Status: INVESTIGATED. No code changed in this session. Conclusion is
Case C (see §17.7) — a fix would require reopening the already-reverted
subtree-repair design §9 documents, so none was implemented.**

Scope: the two hazards §16.2 surfaced while investigating ordered-list
Tab/Shift-Tab *numbering* — (1) Tab selecting a list's first item
together with later items, (2) Shift-Tab on only part of a nested group.
Both are investigated here on their own terms, independent of numbering,
per the explicit instruction that produced this section.

### 17.1 Hazard 1 — Tab: first item + later items — IMPLEMENTED... no,
INVESTIGATED + REPRODUCED

Reproduction (`1. A\n2. B\n3. C`, select `A+B`, press Tab twice — 4
spaces, i.e. two `INDENT_STEP_SPACES` presses):

```
before: 1. A / 2. B / 3. C
after:  "    1. A\n    2. B\n3. C"
```

Resulting tree: **one** `ListItem` spans both physical lines —
`ListItem[0,17) "    1. A\n    2. B"` with a single `ListMark` for `1.`
and a `Paragraph` whose text is literally `"A\n    2. B"`. B's own `2.`
never becomes a `ListMark` at all; B has no `ListItem`-hood left. `3. C`
(untouched, still at column 0) becomes a second, correctly-parsed
top-level `ListItem`, a sibling of the merged A+B item — so the
resulting `OrderedList` now has *two* real items instead of three, and
one of them silently contains two lines of un-nested source text.

**Confirmed not selection-count-specific**: the identical swallow
reproduces with `A+B+C` (all three selected), and with a single Tab
followed by a second, separately-issued Tab (i.e., it is not an artifact
of batching multiple lines into one `ChangeSet` — pressing Tab twice in
a row on a live view produces the same result). It also reproduces at 3
Tabs (6 spaces) — not a magic-4 special case, any width ≥4 with no
enclosing container triggers it (§17.3 explains the exact threshold).

**Confirmed not delimiter- or numbering-specific**: renumbering B's
literal marker to `1.` (matching A) does not prevent the swallow —
identical tree shape. Converting the whole example to bullets (`- A`,
`- B`, `- C`) reproduces an **analogous but structurally different**
failure — see §17.3's asymmetry finding; bullets do not lose
`ListItem`-hood, they get silently re-parented instead.

**Confirmed not selection-order-specific**: selecting only `B+C` (A left
untouched, still at column 0) does **not** reproduce the hazard — B and
C are correctly, cleanly nested as two real `ListItem`s inside a new
`OrderedList` under A (§17.5, test 1p). The hazard requires the
selection to include the list's **own first item**, specifically because
that item has no real container to be nested "into" — see §17.4.

### 17.2 Hazard 2 — Shift-Tab on part of a nested group — INVESTIGATED + REPRODUCED

Reproduction (`1. A\n    1. B\n    2. C\n    3. D\n2. E`, all four
possible single/pair Shift-Tab selections tested):

| Selection | Result | B/C/D fate |
|---|---|---|
| B only | `1. A\n  1. B\n    2. C\n    3. D\n2. E` | **C and D both swallowed** into B's own `Paragraph` as plain continuation text — neither keeps `ListItem`/`ListMark` status |
| C only | `1. A\n    1. B\n  2. C\n    3. D\n2. E` | B stays correctly nested under A; **D is swallowed** into C's `Paragraph` |
| D only | `1. A\n    1. B\n    2. C\n  3. D\n2. E` | B and C stay correctly nested under A; D cleanly becomes its own top-level sibling — **nothing swallowed** |
| B+C | dedent both, leave D | D (untouched) is **swallowed** into C's `Paragraph` |
| C+D | dedent both, leave nothing after | B stays nested; C and D both become correct top-level siblings — **nothing swallowed** |
| B+C+D | dedent all three | all three become correct top-level siblings — **nothing swallowed** |

**Precise invariant, derived from this table**: Shift-Tab-ing item X out
of a nested group corrupts an untouched item Y **only when Y
immediately follows X in document order, was at X's old (deeper)
column, and X was dedented while Y was not.** Dedenting the *entire*
tail of a nested group (a contiguous suffix through the group's last
item), or dedenting only the group's *last* item, never corrupts
anything — there is nothing after the touched item left behind at the
old column. This is not "any partial Shift-Tab is dangerous" — it is
specifically "a partial *prefix* Shift-Tab, or a scattered non-suffix
selection, leaves an orphan."

**Confirmed for bullets too, but with a materially better failure
mode**: the identical bullet reproduction (`- A / - B / - C / - D / - E`,
same selections) shows the leftover siblings are never actually
destroyed — they get **re-parented one level deeper**, correctly, as
real `ListItem`s nested under the item that was dedented past them, e.g.
`- B` (dedented) followed by `- C` / `- D` (untouched) parses as C and D
becoming genuine children of B, inside a real nested `BulletList` — not
swallowed into B's `Paragraph`. §17.3 explains exactly why bullets and
ordered lists diverge here.

### 17.3 Why bullets and ordered lists diverge — the marker-width mechanism — IMPLEMENTED + VERIFIED (the explanation, empirically confirmed against the parser)

Both hazards reduce to the same arithmetic. After a dedent (or an
initial over-indent) moves item X to a new column `c`, whether an
untouched item Y sitting at the old column `oldCol` still parses
correctly depends on where `oldCol` falls relative to two thresholds
computed from X's *new* position:

- **X's new content column** = `c + markerWidth(X) + 1` (the minimum
  column for `oldCol` to still qualify as X's own nested child).
- **The sibling tolerance ceiling for X's new level** = `c + 3` (the
  CommonMark 0–3-space fuzz for a marker to still count as X's own
  sibling at the same level).

If `oldCol` is `> c+3` (fails sibling) `AND` `< c + markerWidth(X) + 1`
(fails nesting), Y falls into the gap and is swallowed as lazy
continuation of X's `Paragraph` — this is the exact same "Rule #5 gap"
concept §14.9 already established for Tab, now shown to apply
symmetrically to Shift-Tab.

The step size in both Tab and Shift-Tab is fixed at
`INDENT_STEP_SPACES = 2` (§9). A bullet marker is 1 character
(`markerWidth = 1`), so a single 2-space step closes the gap exactly:
X's new content column is `c + 2`, and every reproduction above places
`oldCol` at precisely `c + 2` relative to X's new column — landing
**exactly on** the nesting floor, so Y is re-parented as X's real child
rather than swallowed. An ordered marker is 2 characters for single
digits (`markerWidth = 2`), so the identical geometry (`oldCol = c + 2`)
falls **1 column short** of the ordered item's new content column
(`c + 3`) — inside the gap, not past it — so Y qualifies for neither
sibling status nor child status and is swallowed as lazy continuation.
The one-character difference in marker width is the entire divergence:
the same edit, the same step size, the same starting geometry produces
"cleanly re-parented" for bullets and "silently destroyed" for ordered
lists, purely because `markerWidth(ordered) = markerWidth(bullet) + 1`.
Wider ordered markers (2+ digits) only widen this same gap further —
consistent with, not separate from, §14's own finding about
digit-width-driven nesting failures. **Net effect: for ordered lists,
exactly the same class of edit that safely re-parents a bullet list is a
genuine `ListItem`-destroying edit — the divergence is entirely
explained by the marker-width-vs-step-size mismatch this document has
already identified as ordered lists' central structural issue (§14.13),
not a new, independent defect.**

### 17.4 Is `IndentedCode` removal causal? — IMPLEMENTED + VERIFIED (yes, for Hazard 1's specific trigger condition)

Directly tested by re-running Hazard 1's reproduction through a second,
"baseline" parser config — `markdownGrammarExtensions` with the
`{ remove: ['IndentedCode'] }` entry left out — everything else
identical:

- **A lone, document-initial `1. A` item, indented to 4 spaces (two
  Tabs) under the *production* grammar**: parses as `OrderedList` >
  `ListItem` > `ListMark "1."` — a real list item, per §17.1.
- **The identical text under the *baseline* grammar (`IndentedCode`
  present)**: parses as `CodeBlock` > `CodeText "1. A"` — not a list at
  all. This is exactly CommonMark's standard behavior: 4+ columns of
  leading indentation with no established container is an indented code
  block, full stop.
- **The full `A+B` reproduction under baseline**: the *entire* two-line
  span becomes one `CodeBlock` (`CodeText "1. A\n"` + `CodeText "2. B"`)
  followed by `3. C` as a normal, untouched sibling `ListItem`. Under
  baseline, both A and B lose list-item-hood **together, consistently**
  — a well-defined, unsurprising CommonMark outcome (a user who
  triple-Tabs a list into oblivion gets a code block, not corruption).

**Conclusion: `IndentedCode` removal is directly causal for Hazard 1's
*existence as a partial, asymmetric corruption* rather than a clean,
consistent (if surprising) code-block reclassification.** Without the
removal, over-indenting a document-initial list produces a different,
arguably more defensible outcome (uniform code-block reclassification)
than what Clutter's grammar produces (one item silently keeps
`ListItem` status while its sibling silently doesn't). This is not
presented as a reason to reverse the `IndentedCode` removal — that
decision's own tradeoffs are already documented and out of scope per
the task instructions — only as a precise causal answer to the question
asked. Hazard 2 (Shift-Tab) does **not** depend on `IndentedCode` at
all — it reproduces identically regardless of that grammar setting,
since it never involves indentation deep enough to reach the
indented-code threshold in the first place; it is pure Rule #5 gap
arithmetic (§17.3).

### 17.5 Is this a Clutter Tab bug, a Markdown limitation, or unavoidable? — IMPLEMENTED + VERIFIED (native CM6 comparison)

Both hazards were re-run through **plain, unmodified `@codemirror/commands`
`indentMore`/`indentLess`** (not Clutter's `markdownIndentMore`/
`markdownIndentLess`) against the exact same grammar (`markdownLanguageExtension()`
plus an `indentUnit.of('  ')` facet so the step size matches):

- Hazard 1 (`A+B`, two `indentMore` presses): **byte-identical** output
  and tree to Clutter's own command — `"    1. A\n    2. B\n3. C"`, same
  single-`ListItem`-swallowing-B shape.
- Hazard 2 (Shift-Tab B only, via `indentLess`): **byte-identical**
  output and tree to Clutter's own command.

**This settles §17's central question: this is Case A, not Case B.**
Clutter's Tab/Shift-Tab commands are not introducing any behavior beyond
"add/remove `INDENT_STEP_SPACES` of leading whitespace on the selected
physical lines, then let the parser reparse" — exactly what §9's
contract already says they do, and exactly what generic CM6's own
built-in indent commands do given the same grammar. The corruption is a
property of **CommonMark list-nesting arithmetic interacting with
Clutter's `IndentedCode` removal (Hazard 1) and with plain marker-width
math (Hazard 2)**, not of any Clutter-specific Tab/Shift-Tab logic. A
manual, hand-typed document with the exact same post-edit source (no Tab
or Shift-Tab involved at all) parses identically — confirmed implicitly
by the fact that every reproduction above is inspected purely by
re-parsing the resulting text; nothing about the tree shape depends on
which command produced the bytes.

### 17.6 Can the hazard be prevented without construct-aware indentation? — INVESTIGATED + REJECTED

Per §9's own already-recorded history (the file's top doc comment,
`markdownIndentKeymap.ts` lines 12–47): a construct-aware, hierarchy-
preserving version of Tab/Shift-Tab was already built, evaluated, and
reverted before this session began, specifically because achieving a
genuine "never let an edit corrupt an unselected line's structure"
guarantee **is not achievable while staying valid CommonMark** — the
prior investigation that produced that revert is exactly the same
class of problem posed by Hazard 1 and Hazard 2. This session's findings
are consistent with, not a new challenge to, that prior conclusion:
every one of the six alternatives the current instructions asked to
consider (constrain the selection, map/adjust it differently, detect the
first item's special role, etc.) would require exactly the kind of
descendant-aware, selection-independent rewriting `markdownIndentKeymap.ts`'s
comment already documents as tried and reverted for producing no real
benefit over plain per-line edits except two narrow cosmetic cases.
Nothing probed this session surfaces a new, narrower angle that prior
work didn't already cover — re-attempting it would be re-opening a
closed investigation, not applying its result to a new case.

### 17.7 Smallest safe invariant, and which Case this actually is

Evaluating the four candidate invariants against the evidence above:

- **Invariant A/B/C** (some version of "an edit must not corrupt an
  unselected line's structure") — would require exactly the
  descendant-aware rewriting §17.6 shows was already tried and reverted;
  cannot be achieved while keeping Tab/Shift-Tab a pure physical-line
  edit, i.e., cannot be achieved without violating §9's Locked contract.
- **Invariant D** ("the current physical-line model is fundamentally
  insufficient for this operation") — is the conclusion this
  investigation actually supports, not because the model is *wrong*,
  but because it is a **direct, documented consequence of the same
  design tradeoff §9 already made deliberately**, and because §17.5
  shows generic CM6 has the identical limitation given the same
  grammar. There is no "smaller" invariant available between "accept
  the physical-line model's consequences" and "rebuild hierarchy
  preservation" — the prior investigation already searched that space.

**This is Case C** (per the investigation framework's own three
options): *the operation cannot be made structurally safe without
violating the existing §9 physical-line contract.* Per the explicit
instruction governing this phase, this means: **stop and report, do not
implement.**

### 17.8 Proposed fix

**None.** Per §17.7's Case C conclusion, no fix is proposed for
implementation in this session. If this is revisited in the future, the
two directions on the table are the same two §14/§16 already named for
the unrelated numbering problem — a narrower per-case guard (e.g.,
detect "the selection includes a list's own first item and the result
would push it past its current sibling-tolerance ceiling" and decline to
apply the edit to that one line) or full construct-aware Tab — and both
require an explicit, deliberate amendment to §9's Locked contract before
any code is written, exactly as items 7/8 in the consolidated open-
questions list already require for the numbering-side changes. Nothing
here is more implementable today than those already-deferred items.

### 17.9 Regression test matrix (proposed, not implemented)

| Case | Source shape | Selection | Expected today (per this investigation) |
|---|---|---|---|
| Tab: first item alone | `1. A` doc-initial | A only | stays a lone top-level `ListItem`, no corruption possible (nothing follows) |
| Tab: first + second | `1. A\n2. B\n3. C` | A+B, 2 presses | **B swallowed into A's paragraph** — corruption |
| Tab: first + all | same | A+B+C, 2 presses | **B swallowed**, C untouched and safe |
| Tab: second + third only | same | B+C, 2 presses | correctly nested under A — **no corruption** |
| Tab: first + nested descendants | `1. A\n2. B\n   1. Child\n3. C` | A+B | B (and its own child) swallowed the same way |
| Tab: bullet equivalent, first+second | `- A\n- B\n- C` | A+B, 2 presses | **not swallowed — re-parented** as B's real nested child (structurally valid, different hierarchy than before) |
| Tab: mixed paragraph/list, first+second | `1. A\n2. B\n3. C\nPara` | A+B | same swallow, Para unaffected |
| Shift-Tab: first nested item alone | `1. A\n    1. B\n    2. C\n    3. D\n2. E` | B only | **C and D swallowed** into B's paragraph |
| Shift-Tab: middle nested item alone | same | C only | **D swallowed** into C's paragraph; B safe |
| Shift-Tab: last nested item alone | same | D only | **no corruption** — B, C stay nested, D becomes a clean sibling |
| Shift-Tab: first+middle | same | B+C | **D swallowed** |
| Shift-Tab: middle+last (suffix) | same | C+D | **no corruption** |
| Shift-Tab: whole nested group | same | B+C+D | **no corruption** |
| Shift-Tab: bullet equivalent, first alone | `- A\n  - B\n  - C\n  - D\n- E` | B only | **not swallowed — re-parented**, C/D become B's real nested children |
| Native CM6 cross-check | any of the above | same | byte-identical to Clutter's own command (already confirmed, §17.5) |

Every row marked "no corruption" or "re-parented" above has direct
parser-tree evidence from this session (§17.1/§17.2/§17.5); every row
marked "swallowed" likewise. Nothing in this table is a projection.

### 17.10 Summary of evidence labels for this section

- §17.1, §17.2 (reproductions): **INVESTIGATED + REPRODUCED**.
- §17.3 (marker-width mechanism): **IMPLEMENTED + VERIFIED** (as an
  empirically-confirmed explanation — nothing was implemented in code,
  "verified" here means directly checked against the parser, matching
  this document's established labeling convention for a confirmed-by-
  direct-inspection finding).
- §17.4 (`IndentedCode` causality): **IMPLEMENTED + VERIFIED**.
- §17.5 (native CM6 comparison): **IMPLEMENTED + VERIFIED**.
- §17.6 (alternative-design search): **INVESTIGATED + REJECTED**.
- §17.7 (invariant/Case determination): **Case C — ACCEPTED LIMITATION**,
  not a bug to schedule.
- §17.8 (fix): **NOT IMPLEMENTED**, deliberately, per §17.7.
- §17.9 (test matrix): **NOT YET INVESTIGATED as automated tests** — the
  underlying tree shapes are confirmed (this session's own probes), but
  no permanent test file was added since no code changed and this
  document's convention is to add regression tests alongside a fix, not
  in place of one.

---

## 18. Logical list-level Tab/Shift-Tab semantics — investigated, not implemented (2026-08-30)

**Status: INVESTIGATED. No production code changed. A closed-form,
non-trial-and-error implementation model was found feasible and, as a
side effect, was shown to eliminate both Phase 17 hazards in every
tested case — but this is a design recommendation, not an approved
change to §9's Locked contract.**

### 18.1 Product expectation under test

> One Tab on a list item should mean "move this item one logical list
> level deeper," not "add exactly `INDENT_STEP_SPACES` and hope the
> parser happens to reclassify it as nested." One Shift-Tab should mean
> the inverse: "move this item one logical list level outward."

Today's Tab/Shift-Tab (§9) do neither — they add/remove a fixed 2
columns regardless of what "one level" actually requires for the
specific marker involved. This section investigates whether a
level-aware model is achievable without abandoning Markdown as the
canonical source of truth (i.e., without storing any indent-level state
outside the text itself).

### 18.2 What source indentation one logical level actually requires — IMPLEMENTED + VERIFIED (empirically swept against the real parser)

Swept, for a parent at column 0, the minimum/maximum child indentation
that the *installed* `@lezer/markdown@1.7.2` parser (through Clutter's
own `markdownLanguageExtension()`) recognizes as genuinely nested under
that parent, for every marker width in play:

| Parent marker | `markerWidth` | Content column (nesting floor) | Nested window | Swallow gap before the floor |
|---|---|---|---|---|
| `-` / `*` / `+` (bullet) | 1 | 2 | [2, 5] | none (0–3 sibling tolerance meets the floor exactly) |
| `1.` (1-digit) | 2 | 3 | [3, 6] | none |
| `10.` (2-digit) | 3 | 4 | [4, 7] | none |
| `100.` (3-digit) | 4 | 5 | [5, 8] | **column 4 is an orphan gap** — too indented to be a sibling (>3), too shallow to nest (<5) |
| `1)` (paren-style) | 2 | 3 | [3, 6] | none (identical to `.`-style) |

**The formula, confirmed exactly for every row above and for a second
nesting level (§18's grandchild sweep, `1. Parent` → `1. Child` at
column 3 → grandchild swept 0–8) with no deviation**:

```
contentColumn(item) = item's own column + markerWidth(item's marker) + 1
```

This is the same formula §14.9/§17.3 already derived analytically —
this section's contribution is confirming it holds identically at a
second nesting level (parent→child→grandchild), not just parent→child,
and confirming the swallow-gap-vs-clean-floor split correlates exactly
with `markerWidth ≥ 4` (3+ digit ordered markers only) — 1–2 digit
ordered markers and all bullet styles have *no* gap at all, matching
§14's own finding that the practical severity is digit-width-specific.

**Consequence for the product question**: "one logical level" requires
a *different* number of columns depending on the parent's own marker
width — 2 for bullets, 3 for 1-digit ordered, 4 for 2-digit ordered, 5
for 3-digit ordered, and so on (`markerWidth + 1`, uncapped as digit
count grows, matching §14.1's already-confirmed up-to-9-digit ceiling).
There is no single fixed number that is correct for every case.

### 18.3 Is a public API available for this, or must private parser internals be reproduced? — IMPLEMENTED + VERIFIED (no public API; the public tree-geometry approach works and needs no private internals)

`@codemirror/language` does export a public `getIndentation(state, pos)`
function. Tested directly against `"1. Parent"`, `"10. Parent"`,
`"100. Parent"`, `"1000. Parent"`, `"- Parent"`, and `"1) Parent"`, at
the position right after each line (where CM6's own auto-indent-on-Enter
machinery would consult it): **`getIndentation` returns `null` in every
case.** This confirms `@lezer/markdown`'s `List`/`ListItem`/`OrderedList`
nodes register no `indentNodeProp` — the public auto-indent API this
grammar could have hooked into simply isn't wired up for lists, matching
the prior investigation's finding that `getListIndent()` exists
internally but is not exported.

**However, the formula in §18.2 does not require that private function
or any private API at all.** It is fully reproducible using only public
`@lezer/common` `SyntaxNode` surface already used elsewhere in this
codebase (`node.name`, `node.from`, `node.to`, `.parent`, `.firstChild`,
`.nextSibling`) — reading a real preceding sibling's own `ListMark`
node's `to` position and adding 1. No copying of `@lezer/markdown`'s
internal `getListIndent` logic is needed; the same result falls out of
inspecting the tree the parser already produces.

### 18.4 One-Tab transitions — exhaustively tested, prototype (test-only, not shipped)

A minimal prototype ("Model C", test-only code in a deleted probe file,
never merged) was built to make this concrete: for the first selected
line's `ListItem`, find its true previous sibling within the same list
container in the **pre-edit** tree; if that sibling already contains a
nested list, reuse that nested list's own reference column (join the
existing destination, per §16.3's "join, don't duplicate" policy); if it
doesn't, target = `contentColumnOf(precedingSibling)` from §18.2's
formula. Shift by exactly that delta.

Tested and confirmed **exactly one structural level crossed**, before
and after tree checked in every case:

| Case | Result |
|---|---|
| 1-digit parent → child | depth 0 → 1, delta computed = 3 |
| 2-digit parent → child | depth 0 → 1, delta computed = 4 |
| 3-digit parent → child | depth 0 → 1, delta computed = 5 |
| Bullet parent → child | depth 0 → 1, delta computed = 2 |
| Level-1 item → level-2 (nest under its own preceding level-1 sibling) | depth 1 → 2, delta computed fresh from the *level-1* sibling's own marker, not the top-level parent's |
| Existing destination list already present | new item joins the *existing* nested list at its established column — does not create a redundant second nested list |
| First item of a list (no preceding sibling anywhere) | **correctly a no-op** — there is nothing to nest under, matching standard outliner UX (Workflowy/Notion/OneNote all refuse to indent a list's first item) |
| Item with multiline continuation content | continuation moves by the *same* delta as the marker line, staying aligned to the item's new content column — confirmed only when the edit is scoped to the item's full node span (`item.to`), not just the touched line; a single-line-only scope left continuation mis-aligned (relatively harmless for plain text, since CommonMark's paragraph-laziness rule doesn't require any specific column for continuation text — but this **would** matter if continuation itself contained a marker-like line, so real correctness requires span-aware, not line-only, application) |
| Item with its own nested descendants | descendants shift by the same delta, staying valid, tested directly |
| `1)` marker parent | identical formula and result to `.`-style (§18.2's table already covers this — no separate transition table needed, the geometry is delimiter-agnostic) |
| Ordered parent, bullet-marker line immediately after it at column 0 | **not a valid "mixed same-level" case at all** — §16.1 already established a delimiter/kind change always splits into two independent top-level lists; the bullet line has no preceding sibling *in its own list* (it's the first and only item of a brand-new `BulletList`), so Model C correctly reports "no target," which is the right answer for a case that cannot occur as a real nested-vs-sibling ambiguity in the first place |

**Multi-item selection (including the exact Phase 17 Hazard 1 shape)**:
extended the prototype to walk *all* top-level selected `ListItem`s in
document order, computing the first one's delta from its true (possibly
unselected) preceding sibling, and reusing that same delta for
subsequent selected siblings so they stay siblings of each other (if the
first item's delta was 0 — i.e., it was the list's own first item — the
next selected item computes its own fresh delta from the still-unmoved
first item instead). Tested directly against Phase 17's own
reproduction:

```
before: 1. A / 2. B / 3. C   (select A+B, Tab)
after:  1. A / "   2. B" / 3. C   — B correctly depth 1 under A, A unmoved, C untouched
```

and the 3-digit worst case (`100. A` / `101. B` / `102. C`, same
selection) produces the identical clean result with delta 5 instead of
3. **Neither reproduces Phase 17's swallow.** See §18.7.

### 18.5 Shift-Tab as the inverse — tested, confirmed asymmetric-but-sound

The natural inverse rule: for a selected `ListItem`, find its immediate
parent `ListItem` (the item that owns the enclosing list); if none,
already top-level, no-op; otherwise target = that parent's own column
exactly (become a sibling of your own current parent). Tested against
Phase 17's own Hazard 2 fixture (`1. A` with nested `1. B` / `2. C` /
`3. D`, then `2. E`):

| Selection | Result under the logical model |
|---|---|
| B only | B moves to column 0 (sibling of A). **C and D are not swallowed — they are correctly re-parented as B's own nested children** (a real, valid `BulletList`/`OrderedList` under B) |
| C only | B stays nested under A; C moves to column 0; **D is re-parented under C**, not swallowed |
| D only (last child) | B, C stay under A; D cleanly becomes a top-level sibling — matches Phase 17's finding that dedenting the last item was always safe |
| Top-level item | correctly a no-op (no parent to become a sibling of) |
| 3-digit nested marker (`100.` nested under a 1-digit parent) | moves from column 5 to column 0 in one step, no intermediate mis-parse |

This is standard outliner semantics (Workflowy/OneNote/Word: outdenting
a middle item takes its remaining younger siblings with it as its own
new children) — not a compromise invented to dodge Phase 17, but the
behavior a *deliberate*, full jump to the parent's column produces
naturally, instead of an arbitrary partial jump landing in the gap
between "sibling" and "child" that §17.3 identified as the actual
defect. **Shift-Tab is not a naive mirror of Tab's delta** — Tab's delta
is `+ (markerWidth(precedingSibling) + 1)`; Shift-Tab's is
`− (own column − parent's column)`, a different quantity computed from
a different anchor (parent vs. preceding sibling) — but both are
single, closed-form, no-trial-and-error calculations from the same kind
of tree geometry.

### 18.6 Model comparison

| Model | Verdict |
|---|---|
| **A — fixed 2 spaces (current)** | Confirmed insufficient: only correct for bullets and coincidentally for 1-digit-ordered-into-bullet transitions; wrong for every ordered marker width ≥ 2 digits (§18.2), and is the direct mechanism behind both Phase 17 hazards (§17.3). |
| **B — fixed 4 spaces** | Tested against the same table: correct only for exactly `markerWidth = 3` (2-digit ordered, content column 4); wrong (over-shoots into the swallow gap or beyond) for bullets, 1-digit ordered, and 3+-digit ordered alike. **Confirmed, not assumed, to be no better than Model A** — a different wrong constant is still wrong. |
| **C — marker/content-column-aware (this section's prototype)** | Feasible with a closed-form, single-pass calculation, using only public Lezer tree geometry (§18.3). Produces exactly one logical level in every tested transition (§18.4/§18.5) and, as a side effect, does not reproduce either Phase 17 hazard in any tested case. |
| **D — provisional-edit + reparse-and-retry** | **Not needed.** §18.2's formula is deterministic and closed-form; there is no case in this investigation where the correct target column had to be *discovered* by trial edits rather than *computed* directly from the existing tree. Model D would add a second parse pass and rollback logic for a problem Model C already solves without it. |

### 18.7 Effect on the Phase 17 hazards

Per the instruction not to fix these individually but to determine
whether a logical-level model naturally eliminates them:

- **Hazard 1 (Tab: first item + later items)** — **eliminated in every
  tested case** (§18.4's multi-item table). The mechanism is direct: the
  model never applies the old flat, marker-width-blind delta that
  produced the gap in the first place; the list's own first item
  legitimately has no logical target and is left alone (a UX
  improvement in its own right, matching every mainstream outliner),
  and every other selected item gets a delta *sufficient* to clear its
  own content-column floor, never an arbitrary fixed amount that might
  fall short.
- **Hazard 2 (Shift-Tab: partial nested-group dedent)** — **eliminated
  in every tested case** (§18.5's table). The mechanism: the model
  always jumps a full, correct amount (to the parent's own column), so
  a left-behind sibling either stays correctly nested under the
  now-more-deeply-indented item that got dedented past it (re-parented,
  structurally valid) or, if it's the last item in the chain, needs no
  reattachment at all. There is no case where the jump is *too small*
  to clear the recomputed content-column floor, which was the exact
  cause of the swallow in §17.3.
- **3+-digit ordered markers** — the model's delta is *derived from* the
  marker width, so it is correct by construction at every digit count
  tested (1, 2, 3 digits); nothing in the formula caps out or degrades
  as digit count grows, consistent with §14.1's 9-digit ceiling.
- **The lazy-continuation tolerance window (Rule #5 gap)** — not
  eliminated as a parser fact (CommonMark's own rule still exists and
  always will), but **no longer reachable through an intentional,
  correctly-computed Tab/Shift-Tab**, since the model's target is always
  either past the entire window (nesting) or exactly at a sibling's own
  column (0 relative offset) — it never lands inside the gap the way a
  fixed, marker-width-blind step can.
- **`IndentedCode` removal** — orthogonal. §17.4 traced Hazard 1 to this
  removal specifically in the *document-initial, no-container* case,
  which the logical model sidesteps entirely by refusing to move the
  first item of any list (there is no scenario left where a first item
  gets pushed to 4+ columns by this command). Removing `IndentedCode`
  remains a live, deliberate, unrelated tradeoff (§16.2/§17.4) — the
  logical model does not depend on it being reversed or retained either
  way.
- **Multiline descendants / mixed selections** — handled correctly
  *only* when the implementation moves an item's full node span
  (marker line + continuation + nested descendants), not just the
  explicitly-touched line (§18.4's continuation-content finding). This
  is a **scope requirement for any real implementation**, not a
  remaining hazard — the span-aware prototype variant handled it
  correctly in every case tested.

**None of the Phase 17 hazards are "naturally eliminated" as an
accident of luck — each traces to the exact same root cause §17.3
already named (a fixed, marker-width-blind step landing short of or
inside the Rule #5 gap), and the logical model removes that root cause
directly, by construction, not by patching each hazard's symptom
separately.**

### 18.8 Architectural constraint — compliance check

The existing contract (§9, restated by this phase's own instructions):
indentation must be derived from the resulting source on the next
reparse, never from which keyboard action produced it, and no hidden
"indent level" state may be introduced.

The prototype complies: every target column is computed **fresh, from
the current (pre-edit) syntax tree**, on every keypress — nothing is
cached, remembered, or carried across presses. The pipeline is exactly:

```
current source/tree → read a real sibling/parent's marker geometry
    → compute one target column → emit a plain leading-whitespace edit
    → new source → parser determines the final structure on reparse
```

This is the same shape as today's Tab (§9), with one difference: today's
`lineIndentChange` computes its target using a constant
(`current ± INDENT_STEP_SPACES`); the prototype computes its target using
a value read from the tree (`contentColumnOf(precedingSibling)` /
`parentItem's own column`) instead of a constant. No new persisted
state, no keyboard-action-dependent branching survives past the single
transaction, and the result is exactly as re-derivable from the
resulting Markdown alone as today's behavior — a manually-typed
document with the identical resulting indentation parses identically,
by construction (nothing about the tree depends on how the bytes got
there).

### 18.9 Recommended architecture (recommendation only — not approved)

**Feasible, and recommended for a future implementation pass, subject
to explicit approval**: replace `lineIndentChange`'s constant-based
target (§9's current `current ± INDENT_STEP_SPACES`) with a tree-derived
target using the geometry in §18.2–§18.5, scoped to each top-level
selected `ListItem`'s **full node span** (not just the touched physical
line), with:

- Tab: target = preceding sibling's existing nested-list reference
  column if one exists, else `contentColumnOf(precedingSibling)`; no
  target (no-op) if there is no preceding sibling.
- Shift-Tab: target = the immediate parent `ListItem`'s own column; no
  target (no-op) if already top-level.
- Multi-item selections: first selected top-level item computes its own
  delta (0 if it has no target); later selected top-level siblings reuse
  that delta once established, or compute their own fresh delta from the
  still-unmoved earlier item if the running delta is still 0.
- Non-list lines (paragraphs, headings, blockquotes, code) untouched by
  this section — §9's existing flat, construct-agnostic behavior is not
  proposed to change for them; this model only applies where the
  selected line's own `ListItem` can be resolved in the pre-edit tree.

This is a recommendation for **§9's Locked contract to be explicitly
amended**, not something implemented in this session. Per the governing
instruction, §9's text is left untouched until that approval is given.

### 18.10 Proposed test matrix (design only — nothing implemented)

In addition to every transition already tested empirically in
§18.4/§18.5 (kept as direct evidence, not re-listed here), a real
implementation would need automated coverage for:

- Undo/redo of a single logical Tab/Shift-Tab (expected: one transaction,
  matching §9/§15's existing "one edit = one transaction" pattern —
  not empirically probed against this specific prototype this session).
- Cursor/selection mapping through a variable (non-constant) delta —
  not empirically probed this session (today's fixed-step caret mapping,
  §9, assumes a known constant; a variable delta changes the mapping
  arithmetic but not its shape).
- Selections spanning **multiple, unrelated lists** (not just multiple
  items of one list) — not tested this session.
- Interaction with the still-unresolved ordered-list *numbering*
  question (§16) — explicitly out of scope per this phase's own
  instructions; whatever numbering policy is eventually approved would
  need to be layered on top of whichever indentation model is approved,
  not the reverse.
- The already-identified `MAX_INDENT_LEVELS` ceiling (§9) — a variable-
  width delta changes how many *Tab presses* are needed to reach the
  ceiling from a given marker width; the ceiling's own column value
  (10 spaces) was not re-examined against a variable-delta model this
  session.

### 18.11 Summary of evidence labels for this section

- §18.2 (content-column formula, swept): **IMPLEMENTED + VERIFIED**.
- §18.3 (public API search): **IMPLEMENTED + VERIFIED** (no public API;
  public tree geometry suffices).
- §18.4 (one-Tab transitions, prototype): **IMPLEMENTED + VERIFIED**
  (as a test-only prototype, not shipped — every listed transition has
  direct before/after tree evidence from this session).
- §18.5 (Shift-Tab inverse, prototype): **IMPLEMENTED + VERIFIED**, same
  caveat as §18.4.
- §18.6 (model comparison): **INVESTIGATED + REJECTED** for A, B, D;
  **INVESTIGATED, RECOMMENDED** for C.
- §18.7 (hazard interaction): **IMPLEMENTED + VERIFIED** (empirically
  re-run against the prototype, not asserted).
- §18.8 (architecture compliance): **IMPLEMENTED + VERIFIED** (the
  prototype's own data flow was inspected directly, not assumed
  compliant).
- §18.9 (recommended architecture): **RECOMMENDATION, NOT APPROVED** —
  §9's Locked contract is unchanged pending explicit sign-off.
- §18.10 (test matrix): **NOT YET INVESTIGATED as automated tests** —
  design-level only, consistent with §17.9's own convention (tests
  accompany an approved fix, not a recommendation).

### 18.12 Final design pass (2026-08-30) — resolving §18.10's open items before approval

Six targeted follow-up probes (test-only, deleted after use), closing
every item §18.10 had left open, plus the numbering-non-interference
confirmation:

**1. Multiline items and descendants.** Confirmed (again, against a
plain-text continuation case): a continuation line with no blank line
before it is lazy-continued into the SAME `ListItem`'s `Paragraph` — it
is not a separate node to reason about. Any real implementation must
apply its computed delta across the item's **full node span**
(`item.from`–`item.to`), never just the physically-selected line, so
continuation and nested descendants stay aligned to the item's new
content column. This was already stated in §18.4; this pass found no
exception to it.

**2. Multiple selected items, including mixed list/non-list selections.**
Two real gaps were found in the §18.4 prototype, both resolvable, and a
third is a genuine design decision, not a technical blocker:

- **Multiple independent lists in one selection** (e.g. a selection
  spanning two lists separated by a blank line) — the §18.4 prototype
  only walked the *first* selected item's own container and silently
  ignored a second, unrelated list also touched by the same selection.
  **Required fix**: the real implementation must identify every
  distinct top-level list container touched by the selection and run
  the per-container algorithm (§18.4/§18.9) independently for each one
  — not a change to the algorithm itself, just its outer loop.
- **A selection that starts on a non-list line** (e.g. a heading) and
  extends into a list below it — the prototype's `findListItemAt` on
  `range.from` returned `null` and the whole selection was treated as a
  no-op, silently dropping the list lines too. **Required policy,
  confirmed necessary, not previously stated**: dispatch per physical
  line by whether that line resolves to a `ListItem` in the pre-edit
  tree, not by what the selection's own start line is. A line that
  isn't part of any `ListItem` (heading, blockquote, plain paragraph
  with no owning list) keeps §9's **existing** flat, construct-agnostic
  `± INDENT_STEP_SPACES` behavior unchanged; a line that is part of a
  `ListItem` uses the new logical target for that item's whole span.
  This means the amendment is additive and scoped — non-list lines are
  provably untouched by it, addressing the "mixed selection" case
  cleanly.
- **Which delta a later selected sibling should reuse when lists differ
  in kind or width** — not newly probed this pass (already covered by
  §18.4's skip-then-reanchor design, which computes per-container, so a
  second list's own first selected item establishes its own fresh
  delta independently of the first list's).

**3. Cursor/selection mapping under a variable delta.** Tested directly:
caret at content-start of a Tab-moved item, caret mid-word, and a
multi-item selection with a composed multi-part `ChangeSet`. **All three
mapped exactly correctly using the existing mechanism already in
production** (`state.selection.map(changeSet, 1)` for Tab's forward
insertion case, unchanged from §9's current caret-tracking fix) — no new
mapping logic, special-casing, or variable-delta-aware code is required.
CM6's `ChangeSet` position-mapping is delta-magnitude-agnostic by
design; today's code already builds one `ChangeSet` from a list of
per-line `ChangeSpec`s and maps the selection through it once, and nothing
about that step depends on every `ChangeSpec` inserting the *same* number
of characters. **This item is resolved: no open risk.**

**4. Interaction with the existing Enter width-boundary fix (§15).**
Tested directly: built a document whose 3-digit-adjacent nesting shape
mirrors what a logical Tab would produce (`8. A` / `9. B` /
5-space-nested `1. Child` / `10. C`), then pressed Enter on `B`. Result:
`continueMarkupPreservingStructure` (§15) declined exactly the risky
`9→10` rewrite that would have broken `Child`'s nesting, while still
applying the independently-safe `10→11` rename to the trailing sibling
— **byte-identical to §15's own documented behavior**, with zero
awareness of, or dependency on, how the document's indentation arose.
This confirms what §9's architecture already implies: Enter's guard
reads the tree at Enter-time and has no coupling to Tab/Shift-Tab at
all — **the two features do not need to coordinate, and neither
implementation constrains the other.**

**5. Numbering remains untouched.** Confirmed by construction, not by a
new probe: every change emitted by the §18.4/§18.5/§18.9 design is a
`{ from, to, insert: ' '.repeat(n) }` replacement scoped to a line's
*leading whitespace range only* — it never touches a `ListMark` node's
own character range, and no code path in the recommended architecture
reads or writes a marker's digits, delimiter, or numeric value.
Numbering (§16) remains a fully separate, still-undecided concern, to
be layered on top of whichever indentation model is approved, exactly
as §18.10 already stated.

**6. Final §9 contract amendment and architecture — see the "Final
recommended behavior and architecture" summary delivered alongside this
entry.** No production code was changed to produce it; this entry
documents that a text-only design report was delivered and is pending
approval, not that any code was written.

**Evidence label for this entry: IMPLEMENTED + VERIFIED** for items
1–5 (all directly probed or confirmed by direct code inspection this
pass); item 6 is a **RECOMMENDATION, NOT APPROVED**, same status as
§18.9.

---

## 19. Backspace on an empty ordered-list item now closes the numbering gap, matching Enter (2026-08-30, IMPLEMENTED)

**Reported directly by the user**: `1. Text / 2. Text`, Enter after
`1. Text` produces `1. Text / 2. / 3. Text`. From there, Enter on the
empty `2.` renumbers `3.` down to `2.`; Backspace on the same empty `2.`
left `3.` untouched. Investigated first (this section), then fixed, per
explicit instruction not to assume every ordered-list deletion should
renumber.

### 19.1 Where each command's behavior lives

- **Enter's renumber**: CM6's own `insertNewlineContinueMarkupCommand`
  (`@codemirror/lang-markdown@6.5.2`), in its "empty item, exit list"
  branch — confirmed by direct source read: `if (inner.node.name ==
  "OrderedList") renumberList(inner.item, doc, changes, -2);`. Not
  Clutter's code at all; upstream, built-in convention.
- **Backspace's (previous) non-renumber**: `deleteMarkupBackward`
  (same package) never references `renumberList`/`itemNumber` anywhere —
  confirmed by grep of the installed source. Clutter's own
  `deleteBulletMarkerSeparator` (`markdownEnterKeymap.ts`, extended to
  ordered lists in `27d88baa`) handles the empty-item deletion itself,
  and — until this fix — had no renumbering logic of its own either.
  Two independent, correctly-designed-for-their-own-scope commands
  simply met at the same visual state with different answers; not a
  shared bug.

### 19.2 The exact safe/product rule, established before writing any code

Reusing upstream `renumberList`'s own exact semantics (confirmed by
direct source read of `itemNumber`/`renumberList`, not assumed):

- Compares each sibling's number against the *immediately preceding*
  sibling's own **original, never-rewritten** literal number — starting
  the comparison base at the deleted item's own original number.
- Stops at the first sibling whose number isn't exactly one more than
  expected. **This means an intentionally irregular sequence (`1. / 5. /
  9.`) is preserved by construction, not by a special case bolted on**:
  deleting the empty `5.` leaves `9.` exactly as `9.`, because the walk
  never gets far enough to consider it sequential in the first place.
- Every kept sibling renumbers to exactly one less than its own original
  number — algebraically identical to upstream's `String(prev + 2 +
  offset)` with `offset = -2` (verified by hand-expansion).
- Loses zero-padding on rewrite (`"008."` → `"8."` if renumbered),
  matching Enter's own already-documented lossy behavior (§15.2) — a
  deliberate consistency choice, not a new inconsistency.

### 19.3 Growth vs. shrink — why only half of §15's guard is ever live here

Deletion can only ever shift subsequent numbers **down**. §15's
growth-direction risk (Enter's `9`→`10` case) structurally cannot occur
via this code path — confirmed, not merely argued, by inspecting what
`isRiskyRenumberRewrite` actually computes: `delta = insertedLength -
oldWidth` for every change this function produces is a decrement, so
`delta > 0` (the growth branch) is never reachable from here. Only the
shrink-direction check (safe up to `MAX_SAFE_SHRINK_COLUMNS = 3`) is
ever live.

### 19.4 Implementation

`renumberAfterEmptyItemDeletion` (`markdownEnterKeymap.ts`) reimplements
upstream's exact walk using only public `@lezer/common` tree APIs (no
private `renumberList`/`itemNumber` access), producing plain
`{from, to, insert}` digit-range rewrites. Every rewrite is filtered
through the **exact same, reused (not duplicated or reimplemented)**
`isRiskyRenumberRewrite` function §15 built for Enter, before being
folded into the single dispatched transaction alongside the marker/
separator deletion — one transaction, one undo step, matching the
architecture's existing composed-transaction pattern. Called only when
the deleted item's container is `OrderedList` (bullets have no digits)
and only from the **empty-item** branch of `deleteBulletMarkerSeparator`
— the non-empty (separator-only) branch is unaffected, since only
removing an item can leave a gap to close.

### 19.5 Verification — exhaustive, matching the requested matrix exactly

All confirmed via permanent regression tests
(`markdownBulletBackspace.test.ts`, new describe block, 16 tests) and
live in the webapp:

| Case | Result |
|---|---|
| `1. / 2. / 3.` → delete empty `2.` | → `1. / 2.` (matches Enter byte-for-byte, verified by direct comparison in the same test) |
| `8. / 9. / 10.` → delete empty `9.` | → `8. / 9.` (single-digit-width shrink, safe) |
| `99. / 100. / 101.` → delete empty `100.` | → `99. / 100.` |
| `.` and `)` delimiters | Symmetric, both verified |
| Nested ordered lists | Renumbering scoped strictly to the deleted item's own container — confirmed an outer list's own numbering is untouched by an inner deletion |
| Irregular numbering (`1. / 5. / 9.`) | Preserved — `9.` stays `9.`, confirmed as a direct consequence of §19.2's walk, not a special case |
| Width-boundary shrink + nested child | A child correctly re-parented onto the renamed item survives intact (`8./9./10.` with a nested child under `10.`, renamed to `9.`) |
| **Guard proof** | A large-magnitude padded shrink (`000003.` → `2`, magnitude 6) on a genuinely multi-line item (with a validly-nested child) is **declined** — item stays unchanged, child stays intact. The identical rewrite on a single-line item (no descendant) **is** applied — confirms the reused guard is actually gating something at this call site, not passively never triggering |
| Bullet lists | Never attempt renumbering (no digits) |
| First/last item in a sequence | Deleting the first correctly shifts everything after down by one; deleting the last needs no renumbering (nothing follows) |

**Full verification**: 67/67 tests in `markdownBulletBackspace.test.ts`
(51 pre-existing + 16 new, all passing, zero regressions to the
existing marker/separator policy); 1246/1246 markdown tests overall;
full suite 3094 passing (same 8 pre-existing, unrelated FolderPicker/
MoveDestinationPicker failures, confirmed via `git stash` earlier in
this session); `tsc --noEmit` clean; live webapp verification of the
exact reported scenario (screenshot-confirmed — an `.innerText`
extraction quirk on CM6's blank-line DOM structure produced a
misleading extra-newline reading initially, resolved by cross-checking
against a screenshot and the accessibility tree, both showing the
correct `1. Text` / blank / `2. Text` result).

**Explicitly out of scope, untouched, confirmed by diff**: Tab/
Shift-Tab (`markdownIndentKeymap.ts`, `markdownIndentContext.ts`) —
zero changes. Enter's own `continueMarkupPreservingStructure`/
`isRiskyRenumberRewrite` (§15) — zero changes, only reused by reference.
The non-empty Backspace branch — zero changes.

Evidence label: **IMPLEMENTED + VERIFIED**.

---

## 20. Multi-line selection Backspace/Delete removing whole ordered-list item(s) now renumbers, matching the collapsed-cursor fix (2026-08-30, IMPLEMENTED)

**Found by a systematic audit** of every remaining ordered-list-modifying
operation (Enter, Backspace, Delete, Tab, Shift-Tab, typing/replacing
digits, paste, multi-line selection edits, undo/redo — full matrix in
that audit's own report, not reproduced here) run after §19 shipped.
Two confirmed bugs came out of that audit; only this one (the smaller,
more architecturally consistent of the two) was approved for
implementation. The other — manual digit retyping (e.g. selecting `"9"`
in a multi-line item and typing `"10"`) silently demoting a nested
descendant, with no guard at all since no *Clutter-computed* rewrite
exists for a transaction filter to inspect — was deliberately left open,
pending a product decision on whether Clutter should ever intercept a
user's own literal keystrokes (something no existing guard does).

### 20.1 Root cause

`deleteBulletMarkerSeparator` (§13) and CM6's own `deleteMarkupBackward`
both require a **collapsed** cursor (`range.empty`, confirmed by reading
`node_modules/@codemirror/lang-markdown/dist/index.js` directly, not
inferred). A non-collapsed selection therefore falls straight through
both to generic `deleteCharBackward`/`deleteCharForward` — plain text
splicing, zero Markdown awareness — reproducing the exact numbering gap
§19 already fixed for the collapsed-cursor case, but for the ordinary
"select a line, press Backspace/Delete" gesture: `"1. A\n2. B\n3. C"`,
select the complete `"2. B"` item, Backspace or Delete → `"1. A\n3. C"`
(confirmed live before this fix), not `"1. A\n2. C"`.

### 20.2 Fix

Two changes, both additive to §19's existing mechanism, not a new one:

1. **Generalized `renumberAfterEmptyItemDeletion`** from a single
   `deletedItem: SyntaxNode` to `deletedItems: readonly SyntaxNode[]`.
   Two arithmetic changes cover any run length: `prevOriginal` seeds from
   the **last** deleted item's own original number (still "whatever
   immediately preceded the surviving run," identical to the single-item
   case, which is just this shape with `N = 1`), and every kept sibling
   shifts down by `deletedItems.length` instead of a hardcoded `1`. The
   §19 call site (`deleteBulletMarkerSeparator`) now passes a
   one-element array and is confirmed byte-identical to before this
   change (its own full regression suite, unmodified, still passes).
2. **New `deleteCompleteListItemSelection`**, gated by a new
   `exactListItemSelectionRun(state, from, to)` helper: finds the
   `ListItem` starting exactly at `from` (`listItemStartingAt`, walking
   tree ancestors the same way `listMarkAt` already does elsewhere in
   this file), then walks `nextSibling` accumulating whole items only
   while `to` genuinely reaches past each one — accepting `to` as a valid
   boundary only when it lands exactly on the last accumulated item's own
   `.to` (selection excludes the trailing line break) **or** exactly on
   the *next* sibling's `.from` (selection includes it) — never on
   arithmetic/character counting, so a selection that merely *looks* like
   it spans whole items but actually clips into one (mid-content,
   mid-nested-child) can't accidentally pass. Any gap in the walk (the
   selection would have to cross into a different list/construct to
   reach `to`) also returns `null` before either boundary check, which is
   what keeps this from ever crossing into an unrelated list or marker
   kind — a structural guarantee (`nextSibling` never leaves the same
   parent container), not merely an untested assumption. On a match,
   dispatches one transaction: the selection's own deletion plus every
   `renumberAfterEmptyItemDeletion` rewrite for the surviving siblings,
   filtered through the same `isRiskyRenumberRewrite` guard §15/§19 already
   use, unmodified. Wired into both Backspace (ahead of
   `deleteMarkupBackward`, behind `deleteBulletMarkerSeparator`) and a new
   `Delete` binding (previously unbound in this keymap at all — Delete's
   general lack of Markdown awareness elsewhere is unchanged and remains
   its own separate, not-yet-scoped future phase).

**A first implementation attempt had a real bug**, caught by the test
suite itself, not by inspection: the boundary walk advanced into the next
sibling *before* checking whether `to` already matched that sibling's own
`.from` — meaning it always overshot the reported scenario's exact
boundary by one item and declined every case that should have matched.
Fixed by checking both boundary conditions (`cur.to === to` and
`next.from === to`) before ever deciding to extend the run.

### 20.3 Verification — the audit's own requested matrix, run exactly

`.`/`)` delimiters, arbitrary/irregular numbering, `9→10`/`99→100` width
boundaries, first/middle/last item, multi-item runs (shifts by the run's
own length, not a hardcoded one), a nested list under a *surviving*
sibling (preserved, guard reused unchanged), deleting an item that
*owns* a nested list (whole subtree removed, no orphan), two independent
lists (second untouched), mixed ordered/bullet siblings (never crossed
into), bullet-only runs (never attempts renumbering), three shapes of
decline (partial-content selection, selection not starting at an item
boundary, selection ending inside a nested child rather than at a real
boundary), collapsed selections (still `deleteBulletMarkerSeparator`'s
own scope, unaffected), and one atomic transaction with a single
undo/redo round-trip (verified byte-identical restore and reapply).

**Full verification**: 88/88 tests in `markdownBulletBackspace.test.ts`
(67 pre-existing/§19 + 21 new, all passing); `tsc --noEmit` clean; full
suite 3115/3123 passing, the same 8 pre-existing, unrelated
FolderPicker/MoveDestinationPicker/formatShortcutsKeymap `jsdom`
environment failures already present with this change stashed out
(confirmed via `git stash` in this same session, matching §19's own
verification pattern).

**Explicitly out of scope, untouched**: manual digit-retyping corruption
(this session's audit's other confirmed bug — no guard exists or was
added for it, see this section's own opening note); Tab/Shift-Tab
(unaffected, zero changes); paste (unaffected, zero changes); partial-
content multi-line selections (deliberately still decline, per this
session's own explicit scope — "do not broaden beyond complete ListItem
deletion").

Evidence label: **IMPLEMENTED + VERIFIED**.

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
7. Ordered-list Tab renumbering (§14.0–§14.8) is investigated but
   genuinely undecided — whether a newly-nested item should keep its
   literal number or be rewritten to `1` is a product decision, not
   resolved here, and implementing either answer requires explicitly
   amending §9's own Locked "Tab only ever writes leading whitespace"
   contract first (§14.5), not a silent patch.
8. **Ordered-list Tab nesting mechanics (§14.9–§14.16, deeper follow-up
   investigation) — genuinely undecided, and surfaced one materially
   more severe finding than a UX inconsistency**: Tab's flat 2-space
   step (§9) only reliably nests an ordered item in one press when its
   content column happens to equal 2 spaces, which never happens for
   ordered markers (needs 3–4+ depending on digit count) — unlike
   bullets, where it always does (§14.13's three-concepts table). Worse:
   for any 3-or-more-digit ordered marker (`100.` and above), pressing
   Tab **exactly twice** (Clutter's own step size landing exactly on 4
   spaces) does not "fail to nest" — it silently **destroys** the second
   item's own list-item structure, merging it as plain lazy-continuation
   text into the *parent's* paragraph (§14.9's Rule #5, §14.10's swept
   probe tables, §14.14). This is a real, reproducible CommonMark
   consequence of the current uniform step size, not a hypothetical edge
   case — flagged as the single highest-priority finding among the
   ordered-list gaps in this document. Whether the fix is a narrower
   "never let Tab land exactly in the Rule #5 gap" guard or a fuller
   construct-aware step size (§14.15's Option B) is an open question
   (§14.16) requiring an explicit amendment to §9's own contract before
   any implementation, exactly like item 7 above but for a different
   clause of that same contract.
9. ~~The Enter/`renumberList` digit-width structural-corruption bug~~ —
   **FIXED, both directions** (§15, `continueMarkupPreservingStructure`
   in `markdownEnterKeymap.ts`, 21 regression tests in
   `markdownEnterRenumberGuard.test.ts`). Growth (§15.1–§15.4) and
   shrink (§15.5–§15.8, including the exact safe/unsafe magnitude
   boundary, confirmed at ≤3/≥4 columns) are both investigated, fixed,
   and verified — the shrink-direction gap this item previously tracked
   is closed. The fix was also refined (§15.6) to decline only the
   specific rewrites that are actually risky rather than an entire
   transaction tail, so an unrelated, independently-safe sibling
   renumber is never dropped as collateral. Remaining, narrower open
   items are tracked in §15.9 (multi-item deletion in one operation, not
   reachable via Enter; descendant-slack-aware growth handling,
   investigated and deliberately not built).
10. The ordered-list Tab/Shift-Tab normalization addendum (§9's "PENDING
    ADDENDUM", superseding items 7/8 above) is an approved *direction*,
    not yet implemented. Its own stated prerequisite (item 9's bug fix)
    is now satisfied — this does not mean the addendum itself is ready
    to build, only that the specific blocker recorded against it has
    been resolved; the addendum's own design (§9's addendum text, §14)
    still needs its own implementation pass, separately.
11. **§16's deep policy investigation validated Option B (conservative,
    membership-change-triggered auto-numbering) as the recommended
    direction, but surfaced two genuinely new, pre-existing Tab/Shift-Tab
    hazards unrelated to numbering** — partial-selection Shift-Tab can
    destroy a left-behind sibling's own list-item structure, and
    Tab-selecting a list's own first item together with later items
    produces a degenerate, non-nesting result (§16.2). **Both hazards
    were investigated to a conclusion in §17 (see item 12) — neither is
    fixed, and per §17.7 neither is schedulable as an ordinary bug fix.**
    Several test-matrix cells (source-list-side normalization, undo/redo,
    cursor mapping, paste/load consistency) remain genuinely unprobed
    pending an actual implementation to test against (§16.9/§16.10). No
    implementation has started.
12. **§17 concluded both hazards from item 11 are Case C — accepted
    limitations, not implementable Tab/Shift-Tab bugs.** Confirmed
    causes: Hazard 1 (first-item-inclusive Tab) is directly caused by the
    `IndentedCode` removal (§17.4, a documented, deliberate tradeoff, not
    reversed here) combined with CommonMark's ordinary 0–3-space sibling
    tolerance; Hazard 2 (partial Shift-Tab) is pure marker-width-vs-
    step-size arithmetic, the same Rule #5 gap mechanism §14.9 already
    described for Tab, now shown to apply to Shift-Tab too and to
    explain exactly why bullets merely mis-nest while ordered lists lose
    `ListItem` status outright (§17.3). Both hazards reproduce
    byte-identically through plain, unmodified CM6 `indentMore`/
    `indentLess` given the same grammar (§17.5) — confirming this is not
    a Clutter-specific Tab/Shift-Tab defect. Fixing either would require
    reopening the construct-aware, hierarchy-preserving Tab design
    `markdownIndentKeymap.ts`'s own header comment already documents as
    built, evaluated, and reverted before this session (§17.6) — not a
    smaller, targeted patch. No fix was implemented; a full proposed test
    matrix (§17.9) and regression-test-independent tree-shape evidence
    (§17.1/§17.2) are recorded for if this is ever revisited.
13. **UPDATE (2026-08-30, §18.16): §18's "logical list level" Tab/
    Shift-Tab model was subsequently approved, implemented, found to
    have a real bug (§18.15), fixed, and then reverted in full** — not
    because the fix was wrong, but because the whole marker-width-/
    hierarchy-aware target-column approach was determined to violate
    the actual product requirement ("every selected line moves by the
    identical physical step, always"). §9's Locked "Tab only ever
    writes `current ± INDENT_STEP_SPACES`" contract is the active
    contract again, unamended, for list and non-list lines alike.
    `markdownIndentKeymap.ts` and its test files are restored to commit
    `b435f159`, confirmed byte-for-byte. §17/§18.1–§18.15 remain as
    historical investigation record only — see §18.16 for the full
    reversion rationale. §17's own two structural hazards (first-item
    Tab, partial Shift-Tab) are therefore genuinely open again under
    the flat model, exactly as they were before any of §18's work
    began — not fixed, not scheduled, per §17.7's original Case C
    conclusion. The ordered-list numbering question (§16) is unaffected
    either way — still separate, still undecided.
