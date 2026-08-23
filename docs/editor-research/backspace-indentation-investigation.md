# Backspace + Indentation Whitespace — Investigation

**Status: evidence-gathering only.** No production code or test files were
modified to produce this document. A scratch vitest spec was created
temporarily under `apps/app/src/features/markdown/editor/codemirror/list/`
to drive the *actual* editor extension stack and dump real document
text/syntax trees after each keystroke; it was deleted immediately after
use and never committed. `git status` on that directory is clean. No
decision about Backspace/indentation ODR behavior is made here — this is
input to that later decision, per the operator's instructions.

Companion documents: `keyboard-odr-test-matrix.md` (the frozen-invariant
layer this feeds into) and `legacy-editor-keyboard-behavior-recovery.md`
(the old-editor evidence layer). Same evidence-class discipline as that
document is used throughout: every claim is tagged **[A]** (directly
observed by executing the real code), **[B]** (reasoned from source but not
independently executed), or **[C]** (known/documented behavior of
third-party code, not verified live in this session) — carried over
explicitly because §2 of this document relies on evidence classes **[A]**
and **[C]** in ways that materially affect how much weight each comparison
row should get.

The `-\n` mount crash involving `separatorRangeAfter` (`listIndentWhitespaceDecoration.ts`)
was not touched and did not affect this investigation — none of the test
documents below produce a bare `-` line.

---

## 0. Method

**Clutter's own behavior (§1)** — **[A]**, the strongest evidence class in
this document. A temporary vitest spec mounted a real `EditorView` with the
*exact* extension stack and precedence order `MarkdownEditor.tsx` uses in
production (`listDeleteKeymap()` → `deleteMarkupForwardKeymap()` →
`markdownLanguageExtension()` → `markdownTabKeymap()` →
`listLineDecoration()` → `listIndentWhitespaceDecoration()` →
`keymap.of(defaultKeymap)`), dispatched real `KeyboardEvent('keydown', {key:
'Backspace'})`/`'Enter'` events at the `contentDOM`, and after every
keystroke printed `view.state.doc.toString()`, the caret offset, and a full
fresh re-parse of the syntax tree. This was necessary, not optional: an
earlier draft of the harness omitted `defaultKeymap()` (the lowest-priority
fallback that owns plain `Backspace` whenever nothing else claims it) and
produced completely misleading "Backspace does nothing" results for most
indentation widths — a trap worth naming explicitly, because it is exactly
the kind of error "inspect the real stack, not an approximation" is meant
to catch.

**VS Code (§2)** — mixed evidence class, stated per-row. `vscode.dev` (the
official browser build of VS Code) was opened in the sandboxed Browser pane
and a Markdown-mode `Untitled` buffer was created and typed into
successfully — text entry and mouse clicks (including triple-click, which
correctly reported "(N selected)" in the status bar) reached the Monaco
editor. However, synthetic `Home`/`ArrowRight` keydown events **did not**
reliably move the Monaco cursor in this sandbox (the status bar's `Ln
X, Col Y` reading never changed across repeated `Home`/`Right` presses that
should have changed it, even though the same click-based interactions
worked) — so **column-precise, keystroke-by-keystroke Backspace
verification inside this session's VS Code instance was not achievable**
before this investigation's effort budget was exhausted on it. Rather than
report fabricated precision, §2's VS Code rows are marked **[C]**: based on
Monaco's own public, stable, documented `deleteLeft` cursor operation
(`cursorDeleteOperations.ts`) and the Markdown language configuration's
`onEnterRules`/`indentationRules` — known, verifiable-on-request behavior,
not a live observation from this session's browser automation.

**Obsidian (§2)** — **no evidence, explicitly.** Obsidian is a desktop
Electron app; nothing in this environment (no desktop automation tool, no
web-editable Obsidian surface, no accessible instance) could drive it. This
is stated as an honest gap, not filled with assumption. If a decision
genuinely turns on Obsidian's specific behavior, that requires a follow-up
pass with actual desktop access, not this document.

---

## 1. Clutter's current behavior — directly observed **[A]**

### 1.1 Is the indentation real document text, or decoration?

**Real document text, unconditionally.** Confirmed by reading
`view.state.doc.toString()` directly (not the rendered DOM) both before and
after every operation below, and by a fresh re-parse of the syntax tree
from that raw string — the leading spaces before a nested `-`/`1.`/`[ ]`
marker are literal characters in `state.doc`, sitting in the `ListItem`
node's own range but *outside* any of its named children (`ListMark`,
`TaskMarker`, `Paragraph`) — an unclaimed gap, not a node of its own.

`listIndentWhitespaceDecoration.ts` (read directly, §6 below) only ever
constructs `Decoration.replace({})` ranges for the *view*; it never touches
`state.doc`, never dispatches a transaction, and is a pure
`view.visibleRanges` → `RangeSetBuilder` read path. **The critical, easy
to miss precision**: this decoration is *not* selection-gated. Its own doc
comment states so explicitly ("never gated on selection, so the cursor
entering a marker never re-adds the whitespace it collapses"), and nothing
in `buildDecorations()` reads `view.state.selection` at all. This means the
leading indentation and the marker/content separator space are visually
collapsed **at all times**, including while the caret sits inside them —
unlike every other Clutter semantic construct (`WikiLink`, `Tag`,
`@mention`, `@due`), which follow reveal-on-engagement (raw Markdown shown
only while the caret is inside the construct's range, per
`docs/editor-architecture-decisions.md`'s "Reveal-on-engagement" entry).
List indentation whitespace is real text with a *permanent* rendering
illusion, not a reveal-on-engagement construct.

### 1.2 The task's own example: 3 leading spaces, caret before the nested `-`

```
- Parent
   |- Child      (caret immediately before "-", i.e. 3 literal space characters precede it)
```

Repeated Backspace, **[A]**, exact document text after each press:

| Press | Document text | Leading spaces before `-` |
|---|---|---|
| 0 (start) | `- Parent\n   - Child` | 3 |
| 1 | `- Parent\n  - Child` | 2 |
| 2 | `- Parent\n- Child` | 0 |
| 3 | `- Parent- Child` | — (newline itself removed; lines joined) |
| 4 | `- Paren- Child` | — (ordinary character deletion inside "Parent") |
| 5 | `- Pare- Child` | — |
| 6 | `- Par- Child` | — |

So: **the first Backspace removes exactly one literal space character**
(3→2), the **second Backspace removes both remaining spaces in a single
keystroke** (2→0, not 2→1→0), the **third Backspace deletes the newline**
(joining "Parent" and "- Child" onto one physical line, "- Child" now
ordinary trailing text, no longer any kind of list construct), and every
Backspace after that is ordinary single-character text deletion with no
list-specific meaning left at all.

This is **neither** "one Backspace removes one indentation level" **nor**
"one Backspace always removes exactly one literal space" **nor** a
structural dedent that preserves the marker at a shallower nesting level
(contrast with §1.4 below, which *is* a genuine structural dedent, at a
different caret position). At *this* caret position (before the marker),
it is neither Clutter-authored behavior nor CommonMark-parser behavior — it
falls through Clutter's own `Prec.high` handlers entirely (§1.5 explains
why) into `@codemirror/commands`' generic `deleteCharBackward`, whose
"smart indent" rule deletes back to the previous multiple of the editor's
`indentUnit` (2, CM6's default) whenever every character before the caret
on the line is whitespace — landing on 2 first because `3 mod 2 = 1`, then
consuming the remaining even multiple in one shot.

### 1.3 Every indentation width, same caret position (before the nested marker)

**[A]**, repeated Backspace until the line rejoins "Parent" or a plain
character deletion begins. All in a fresh `- Parent\n<N spaces>- Child`
document, caret immediately before `-`:

| N (spaces) | Press 1 | Press 2 | Press 3 | Press 4+ |
|---|---|---|---|---|
| 1 | `0 spaces` (this width was never actually nested — see note below) | newline joins | char deletion | — |
| 2 | `0 spaces` (single press, exactly at the mod-2 boundary already) | newline joins | char deletion | — |
| 3 | `2 spaces` | `0 spaces` | newline joins | char deletion |
| 4 | `2 spaces` | `0 spaces` | newline joins | char deletion |
| 5 | `4 spaces` | `2 spaces` | `0 spaces` | newline joins, then char deletion |
| 6 | `2 spaces` | `0 spaces` | newline joins | char deletion |
| 8 | `2 spaces` | `0 spaces` | newline joins | char deletion |

**This is not a uniform rule, and the irregularity is real, not a test
artifact** — reproduced deterministically, and traced to its exact cause
by reading the actual `@codemirror/commands` source
(`deleteByChar`/`deleteCharBackward`, `dist/index.js:1216-1230`, confirmed
**[A]** by direct file read, not assumed): when every character before the
caret on the line is whitespace, `deleteCharBackward` computes `col =
countColumn(before, tabSize)` and `drop = col % indentUnit || indentUnit`
(CM6's default `indentUnit` is 2), then removes exactly `drop` literal
space characters — **one command, one indent-unit-aligned jump**, not
"one space per keystroke." That single formula fully explains every row
above:

- N=1: `1 % 2 = 1` → drop 1 → lands at 0.
- N=2: `2 % 2 = 0` → falls back to the full unit (2) → drop 2 → lands at 0.
- N=3: `3 % 2 = 1` → drop 1 → lands at 2; next press `2 % 2 = 0` → drop 2 → lands at 0.
- N=4: `4 % 2 = 0` → drop 2 → lands at 2; next press drop 2 → lands at 0.
- N=5: `5 % 2 = 1` → drop 1 → lands at 4; then `4 % 2 = 0` → drop 2 → lands at 2; then drop 2 → lands at 0.
- N=6, 8: even, `% 2 = 0` each time → drop 2 repeatedly, but **[A]** shows
  N=6 and N=8 jump straight from N to 2 in **one** press, not through 4
  first. This is a *second*, independent effect layered on top (§1.3.1).

**N=1 caveat, [A]:** with only 1 leading space, "Child" is *not* actually
nested under "Parent" at all — CommonMark requires reaching the parent's
own content column (2, for a `- ` marker) to nest; 1 space keeps "Child" as
a separate **top-level** sibling `ListItem` with 1 column of cosmetic
leading space (CommonMark tolerates 0–3 stray leading spaces on any
top-level marker without creating nesting). Confirmed by the fresh
syntax-tree dump: two sibling `ListItem`s under one `BulletList`, not one
nested inside the other. So N=1 is not a smaller version of the N≥2 nesting
scenario — it is a structurally different starting document that happens
to produce a visually similar result.

#### 1.3.1 N=6 and N=8 are not "more of the same" — the parser stops nesting the item at all

**[A], the single most important structural finding of this
investigation.** At N=6, the fresh initial-state syntax tree (before any
Backspace) is:

```
BulletList [0,22)
  ListItem [0,22)
    ListMark [0,1) = "-"
    Paragraph [2,22) = "Parent\n      - Child"
```

**There is no nested `BulletList`, no nested `ListItem`, no `ListMark` for
"Child" at all.** The entire second line — 6 spaces, `-`, space, `Child` —
is swallowed as **lazy continuation text of Parent's own paragraph**. This
is pure CommonMark, not a Clutter bug: 6 spaces is exactly "parent's
content column (2) + 4", the threshold at which indentation would normally
start an *indented code block* — but indented code blocks (like list
items, per the lazy-continuation rule) cannot interrupt an already-open
paragraph, so the line is folded into the paragraph verbatim instead,
literal `-` character and all. **N=8 behaves identically for the same
reason** (also ≥ threshold). N=2 through N=5 are all *below* that
threshold and do produce a genuine nested `ListItem` (confirmed by their
own tree dumps, all showing `BulletList` → `ListItem` → `ListMark` +
`Paragraph`).

Because N=6/8 start from a document with **no marker node protecting
anything**, none of Clutter's own list-aware Backspace machinery
(`listDeleteKeymap.ts`, `deleteMarkupBackward`'s marker-replacement
branches) has anything to engage with — the caret sits in what the parser
sees as plain paragraph text. What actually fires for the *first*
Backspace at N=6/8 is `deleteMarkupBackward`'s own "delete extra trailing
space after markup" branch, evaluated against **Parent's** own context row
(content column 2) rather than any row for "Child" (there is no such row):
since the gap between column 2 and the caret's column is pure whitespace,
the *entire* gap is deleted in one keystroke, landing exactly on column 2
— which is why N=6 and N=8 both jump straight to 2 in a single press,
while N=3/4/5 (still governed by the generic `indentUnit`-modulo rule of
§1.3, because they *do* have a real nested `ListItem` and reach that rule
by a different path) do not. **After landing on column 2, the document
text is now byte-identical to the N=2 case, and a fresh re-parse
(confirmed [A]) does treat it as a genuine nested `ListItem` from that
point on** — the lazy-continuation state is a property of the specific
document text, re-evaluated after every edit, not a sticky flag.

**Practical implication worth flagging now, not deferred**: any editor
feature that treats "N spaces before what looks like a nested marker" as
"this is a nested list item at depth K" without checking the actual parse
result will silently misclassify N≥6 documents (and this exact threshold
moves with the parent's own content column and marker width — e.g. a
parent using `1. ` has content column 3, moving the threshold to 7).

### 1.4 Caret positions across the marker — the *other* dimension, and where Clutter's own deliberate logic actually lives

**[A]**, fixed at N=3 (`- Parent\n   - Child`), varying only caret column
(0-indexed from line start; column 3 = immediately before `-`, matching
§1.2 above):

| Caret column | Description | 1st Backspace result | Mechanism |
|---|---|---|---|
| 0 | Before all 3 leading spaces (start of line) | `- Parent   - Child` (newline deleted, 3 spaces now mid-line) | Generic: caret has nothing but a line-start before it; deletes the newline (`findClusterBreak` backward across a line boundary) |
| 1 | After 1st leading space | `- Parent\n  - Child` (2 spaces) | `indentUnit`-modulo rule, §1.3 (1 space of *preceding* whitespace on this sub-check ⇒ drop 1) |
| 2 | After 2nd leading space (= Parent's own content column) | `- Parent\n - Child` (1 space) | Same rule, evaluated with only 2 preceding chars whitespace |
| 3 | Immediately before `-` (task's example, = §1.2 above) | `- Parent\n  - Child` (2 spaces) | §1.2/§1.3 |
| 4 | Immediately after `-`, before the separator space | `- Parent\n    Child` (marker `-` deleted outright, replaced by nothing — net width shrinks by exactly 1) | **No protection at all**: neither `deleteMarkupBackwardSubtreeAware`'s gate (requires caret exactly at *content start*, not one column short of it) nor `deleteMarkupBackward`'s own two branches match this exact column (confirmed **[A]** by direct arithmetic against the real `Context` row: `spaceEnd` for this row is column 5, caret is at column 4, matching neither `pos > spaceEnd` nor `pos == spaceEnd`) — so it falls through to plain single-character deletion, which happens to delete the marker's own `-` character with zero list-awareness. **This is the single most fragile position in the whole matrix**: the marker is destroyed with no dedent, no promotion, nothing — a bare character delete that happens to land on a syntactically load-bearing character. |
| 5 | Immediately after the separator space, at content start (i.e. right before "Child") | `- Parent\n- Child` (all 3 leading spaces removed in one keystroke, marker preserved, item promoted to top-level) | **This is Clutter's own, deliberately-authored `deleteMarkupBackwardSubtreeAware` structural dedent** (`listDeleteKeymap.ts`) — confirmed the same code path the module's own test suite exercises (`listDeleteKeymap.test.ts`'s `"- alpha\n  - nested one\n  - nested two"` → `"- alpha\n- nested one\n  - nested two"` case). Promotes the *entire* item (and, per that same module, its whole nested subtree if it owns one) by exactly one structural level, preserving the marker (and checkbox, if a task) verbatim. This is the only caret position in this entire matrix where Backspace is a genuine, Clutter-authored, marker-preserving structural operation rather than an emergent side effect of generic CM6/CommonMark fallback rules. |
| 6 (first char of "Child") | Mid-content | `- Parent\n   - hild` (ordinary content character deleted) | Ordinary text editing, no list logic involved |
| 8 (mid "Child") | Mid-content | `- Parent\n   - Chld` | Ordinary text editing |
| end (after "Child") | End of content | Character-by-character content deletion, and — after all of "Child" is gone — the *same* column-5 structural dedent fires once the caret reaches content-start again (`- Parent\n   - ` → `- Parent\n- ` → `- Parent\n  `, i.e. dedent then generic 2-space removal of the now-bare indent) | Ordinary text editing, then converges onto the column-5 mechanism once content is fully erased |

**The load-bearing conclusion of §1.4**: Clutter has exactly **one** caret
position with genuinely designed, marker-preserving Backspace behavior —
content-start (column 5 in this example, i.e. immediately after the
marker+separator). Every other caret position relative to the marker
(before it, inside it, one column short of content-start) falls through to
generic CM6/CommonMark fallback behavior that was never designed with list
semantics in mind, and column 4 in particular actively destroys the marker
with no safety net at all.

### 1.5 Why the caret-before-marker position never reaches Clutter's own code

Traced directly against the real source, **[A]**: `owningListItem()`
(`listIndentKeymap.ts`) probes at "the line's first non-whitespace
character," which for a caret sitting *before* the marker is the marker
itself — so `owningListItem` does correctly resolve to the nested
`ListItem`. But `deleteMarkupBackwardSubtreeAware`'s own gate
immediately afterward is `pos - line.from !== contentCol` → return
`false`, and `contentCol` is *content start* (one full marker+separator
past where the marker begins), never the marker's own start column. So the
module deliberately, correctly (by its own contract) declines to touch
"before the marker" — its own doc comment never claims that position as
in scope. The gap is real, but it's a *scope* gap, not a *bug* in the
narrow sense: `listDeleteKeymap.ts` was written to solve marker-removal
safety, not general indentation-editing semantics, and the task's own
example caret position sits entirely outside what that module was built to
own.

### 1.6 Tabs and mixed tab/space indentation — [A]

`- Parent\n\t- Child` (one literal tab before the nested marker):

- **Initial parse**: genuinely nested (`BulletList` → `ListItem` with a
  real `ListMark`) — a single tab is wide enough (CM6/Lezer expand tabs to
  the next multiple of the configured tab size, default 4) to clear
  Parent's content column (2) but not wide enough to hit the +4
  lazy-continuation threshold (§1.3.1) computed from *expanded* column
  width.
- **First Backspace removes the entire tab character in one keystroke**,
  landing at column 0 directly (not landing on column 2 like the
  equivalent-width space run would) — confirmed by direct source read of
  `deleteByChar`'s special case: `if (before[before.length-1] == "\t")
  return pos - 1` unconditionally returns "one position back" for a
  trailing tab, bypassing the `indentUnit`-modulo arithmetic entirely. A
  tab is always deleted as exactly one atomic unit, regardless of the
  visual column it represents.
- **Mixed `\t` + 2 spaces** (`\t  - Child`) and **mixed 2 spaces + `\t`**
  (`  \t- Child`): both parse as genuinely nested at the start. Backspace
  removes the trailing run one *character* at a time in both cases (a
  space, then a space or tab, etc.) rather than jumping to a computed
  column boundary — because the `indentUnit`-modulo fast path in
  `deleteByChar` requires the *entire* run before the caret to match
  `/[^ \t]/` test negatively (i.e., be pure space/tab) **and** does its
  column-modulo math only for trailing literal spaces; a tab breaks that
  contiguous-space run and forces the "trailing character is a tab" branch
  to fire on the very next press instead. Net effect: mixed tab/space
  indentation degrades to slower, less predictable, one-character-ish
  removal compared to pure-space runs of the same visual width.

### 1.7 Deeper nesting (3 levels)

**[A]**, `- A\n  - B\n    - C` (2-space indent per level), caret
immediately before the deepest `-`:

| Press | Text | Note |
|---|---|---|
| 1 | `- A\n  - B\n  - C` | C's indent 4→2 (one `indentUnit`-modulo jump, same mechanism as §1.3) |
| 2 | `- A\n  - B\n- C` | C's indent 2→0 |
| 3 | `- A\n  - B- C` | Newline joins B and C onto one line |
| 4 | `- A\n  - - C` | Character deletion into "B" (removes "B", literal `-` from the old C-marker now sits adjacent) |
| 5 | `- A\n- - C` | Continues eating into the "  - " prefix of B's own line |
| 6 | `- A\n  - C` | **Re-grew a leading `  `!** — this is not a typo: once enough of the joined line is deleted, the document re-parses into a *different* structural shape, and the previous view's `contentColumn`-derived deletion target for the *next* keystroke is computed against the newly reparsed tree, not the pre-edit one. Concretely, `- A\n- - C` reparses so that the second `-` is now itself a nested marker one level under the first, and Backspace at that point invokes the column-5-equivalent structural dedent (§1.4) for that marker, which happens to *insert* the 2-space indent it's dedenting *away from* as part of promoting a different item. This is a genuine, reproducible "indentation width visibly increases from one Backspace" case — worth flagging on its own, since "Backspace never increases indentation" would be a natural but false assumption. |

This confirms the general finding from §1.4 generalizes to deeper nesting
without a new mechanism — every level's marker boundary is governed by the
same content-column arithmetic, recomputed fresh against the post-edit
tree after every keystroke, which is exactly why a sequence of Backspaces
can look non-monotonic in raw column count even though each individual
step is deterministic.

### 1.8 Enter interaction sequences

**[A]**, `- Parent\n   - Child`, caret at column 3 (before `-`, the task's
primary position) unless noted:

| Sequence | Result |
|---|---|
| Enter (alone) | `- Parent\n   \n   - Child` — inserts a **blank line preserving the 3-space indent**, caret on the new blank line at column 3. This is `insertNewlineContinueMarkup`'s generic "not in list context yet" behavior (the caret sits in unclaimed padding, not inside any list construct, so it isn't treated as "inside a list item" for continuation purposes) — it does **not** produce a new list item; it inserts a plain blank physical line. |
| Backspace (alone) | `- Parent\n  - Child` (2 spaces) — §1.2/§1.3. |
| Enter, then Backspace | `- Parent\n   \n  - Child` — the blank line from Enter is untouched; Backspace only affects the *next* line's leading whitespace (2 spaces), independently. |
| Backspace, then Enter | `- Parent\n\n  - Child` — after Backspace takes 3→2 spaces, Enter at the (now recomputed) column-2 position inserts a **genuinely blank line with no leading whitespace at all** (not 2 spaces) — different from the "Enter alone" row above, because after one Backspace the caret's column relationship to the tree's content-column boundaries has changed enough that `insertNewlineContinueMarkup` takes its blank-continuation branch instead of its generic-blank-line branch. |
| Backspace, Backspace | `- Parent\n- Child` — confirms §1.3's N=3 sequence (3→2→0) exactly, independent of any Enter interleaving. |
| Backspace, Enter, Backspace | `- Parent\n\n- Child` — composes the two rows above: after BS, ENT produces the bare blank line; the second Backspace then removes the *second* line's now-2-space indent entirely (2→0) in the second line, unaffected by the blank line inserted between them. |

**Takeaway**: Enter's behavior at this exact caret position (inside
unclaimed leading-indentation padding, not yet at any recognized list
boundary) is itself a third, independent source of behavior not
covered by the existing `ENTER-E1`/`E2`/`E3` invariants in
`keyboard-odr-test-matrix.md` — those invariants were written against
caret positions *within* a list item's own recognized range, and none of
them anticipate a caret sitting in the gap *before* a nested marker.

---

## 2. Comparison editors

### 2.1 VS Code — **[C]**, Monaco's documented `deleteLeft` behavior, not live-verified this session

Per the Method section, live column-precise automation was not achievable
in this session's sandbox. Based on Monaco's own shipped, public cursor
operation (`cursorDeleteOperations.ts`'s `deleteLeft`, the same file family
CM6's own `deleteCharBackward` is spiritually modeled after — the two
editors converged on a similar "smart backspace" design independently, not
by sharing code): when the text before the caret on the line is pure
whitespace, Monaco deletes back to the previous tab-stop-aligned column
(governed by the language's configured `tabSize`/`indentSize`, default 4
for Markdown in stock VS Code, **not** 2 like CM6's default `indentUnit`).
The base mechanism is the same *shape* of behavior as Clutter's own
current (accidental) fallback described in §1.3 — column-modulo jump
deletion, not literal single-character removal, and not a marker-aware
structural dedent either — but tuned to a different unit width (4, not 2),
which would produce a different specific sequence of intermediate landing
columns for the same indentation widths.

**Separately** (higher confidence — this is standard, easily-verified
VS Code list-editing knowledge, not something under dispute): VS Code's
built-in Markdown language support does **not** ship a marker-preserving
structural dedent for Backspace at a nested item's content-start
comparable to Clutter's `deleteMarkupBackwardSubtreeAware` — Backspace at
that position in stock VS Code Markdown removes the marker's own
characters via the same generic whitespace-column-collapse mechanism as
any other position, with no special-cased "promote this item's subtree by
one level, preserving the marker" behavior. This means §1.4's single
genuinely-designed Clutter behavior (content-start structural dedent) is
**not** matched by stock VS Code at all — VS Code's model has no
equivalent concept.

**This section should be re-verified with real keystrokes before being
relied on for the ODR** — flagged explicitly rather than silently trusted,
per this investigation's own evidence-class discipline.

### 2.2 Obsidian — no evidence

Not tested. No accessible surface (desktop Electron app, no automation
tool available in this environment, no editable web equivalent). Do not
infer Obsidian's behavior from VS Code's or Clutter's — Obsidian's editor
(CodeMirror 6, notably, same underlying library family as Clutter's own)
could plausibly diverge from both stock CM6 defaults and Clutter's own
customizations in either direction, and its list-editing extensions are
closed-source. A follow-up pass with real desktop access is the only way
to fill this gap honestly.

### 2.3 Decision table

| Scenario | Clutter (observed, [A]) | VS Code ([C], not live-verified) | Obsidian | Markdown source semantics | Recommended Clutter behavior |
|---|---|---|---|---|---|
| 1 space + Backspace (caret before marker) | Not actually nested (top-level item, 1 cosmetic leading space); 1 space removed, single press | Not independently verified | Untested | CommonMark tolerates 0–3 stray leading spaces without nesting | No change needed — this is correct CommonMark-driven behavior, not a list-editing concern |
| 2 spaces + Backspace | Both spaces removed in 1 press (mod-2 boundary already) | Not independently verified | Untested | Exactly at nesting threshold | Consistent with the "unit" framing generally, but accidental, not designed |
| 3 spaces + Backspace | 1 space removed (3→2), landing off the visual "one clean level" expectation | Not independently verified (would use unit=4, not 2, per §2.1) | Untested | 3 spaces still nests (≥ parent content column 2) | **Needs a decision**: is 1-space-then-2-space acceptable, or should this jump straight to promoting the item structurally (as column-5/content-start already does)? |
| 4 spaces + Backspace | 2 spaces removed in 1 press (4→2) | Not independently verified | Untested | 4 spaces nests; still 2 below the lazy-continuation threshold (6) | Same open question as above |
| 4 spaces + repeated Backspace | 4→2→0→(newline join)→char deletion; **never preserves the marker or promotes structurally** at this caret position | Not independently verified | Untested | — | This is the crux: caret-before-marker never gets `deleteMarkupBackwardSubtreeAware`'s protection at all (§1.5) — worth deciding whether it should |
| Tab + Backspace | Entire tab removed atomically in 1 press, regardless of its expanded visual width | Uses `tabSize`/`indentSize`≈4 semantics per Monaco docs, not independently confirmed | Untested | Tabs are valid list-indentation whitespace per CommonMark (expanded per tab-stop rules) | Atomic tab removal is defensible and matches how most editors treat a single literal tab character; low priority to change |
| Nested bullet, caret at content-start | **Marker-preserving structural dedent, whole subtree promoted one level** (`deleteMarkupBackwardSubtreeAware`) | No equivalent structural dedent known; falls back to generic collapse | Untested | — | **This is Clutter's one genuinely good behavior in this whole area** — any redesign should preserve or generalize it, not regress it |
| Nested task | Structural dedent preserves the checkbox (`TaskMarker`) and its checked state, confirmed by the module's own existing test suite | Not independently verified | Untested | — | Preserve this — already correct and already tested in production code |
| Nested ordered list | Structural dedent relocates the item **without renumbering** either the list it left or the one it joins (explicitly out-of-scope per the module's own doc comment, confirmed by its own test: `"- alpha\n  1. one\n  2. two"` → `"- alpha\n1. one\n  2. two"`, "two" left as untouched trailing content) | Not independently verified | Untested | Renumbering after a structural move is a genuinely separate, harder problem (which list does "two" belong to now?) | Known, named, accepted gap — do not silently assume it's fixed; any ODR work in this area should treat nested-ordered-list dedent as explicitly out of scope until decided otherwise |
| Mixed indentation (tab + spaces) | Degrades to slower, one-character-ish removal — loses the column-jump "unit" behavior that pure-space runs get | Not independently verified | Untested | CommonMark permits mixed tab/space indentation | Likely low-priority to special-case; mixed tab/space list indentation is rare and arguably not worth bespoke handling |
| N≥6 spaces before nested marker ("looks nested but isn't") | **Silently parses as lazy paragraph continuation, not a list item at all**, until an edit brings it back under the threshold | Not independently verified, but VS Code's own Markdown grammar implements the same CommonMark lazy-continuation rule, so the *parse* result (not the *edit* behavior) should match | Untested, same caveat | This is CommonMark spec behavior, not editor-specific | **Not a bug to fix** — it's correct per spec — but worth an explicit test/comment somewhere so a future contributor doesn't "fix" it by mistake; the exact threshold (parent content column + 4) is easy to get wrong if re-derived from scratch |

---

## 3. Open questions for the ODR (explicitly not decided here)

1. **Should Backspace with the caret *before* a nested marker (the task's
   own primary example) ever reach a Clutter-authored code path at all**,
   or is generic CM6/CommonMark fallback acceptable there? Right now it is
   accidental, not designed — §1.5 shows precisely why, and §1.4 shows
   exactly one column (content-start) has a designed answer.
2. **Should the column-4 "one before content-start" position** — the one
   place a bare, undefended single Backspace destroys the marker character
   outright with no dedent and no promotion — **be given the same
   protection as content-start**, given how easy it is for a real user's
   caret to land there (it's a single ArrowLeft press away from
   content-start)?
3. **Is the `indentUnit`-modulo (2) "smart" jump-deletion behavior
   (§1.3) desired product behavior for Clutter**, or should raw
   leading-indentation-before-a-marker Backspace be redefined as literal
   one-character deletion, unit-based deletion tied to the *parent's own
   content column* instead of a fixed 2, or a structural dedent matching
   content-start's behavior? This document deliberately takes no position
   — it only establishes precisely what happens today and why.
4. **Nested-ordered-list renumbering-on-dedent** remains a named, accepted
   gap (not new to this investigation) — any Backspace redesign in this
   area should explicitly decide whether to close it or continue deferring
   it, rather than silently inheriting the current gap.
