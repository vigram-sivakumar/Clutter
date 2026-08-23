# Keyboard ODR & Test Matrix — Baseline Invariants

## Status and scope

This document is the seed for two artifacts that do not yet exist as
finished deliverables:

1. **The revised keyboard ODR** (Enter/Backspace/Tab/Shift+Tab/Delete/Arrow
   behavior for the CodeMirror-based Markdown editor).
2. **The keyboard test matrix** that will be built against that ODR.

It is evidence-and-decision scaffolding, not an implementation plan. Entries
recorded here are **frozen invariants to test against**, not approval to
implement or change any current behavior. Do not read anything in this
document as authorization to touch keyboard-handling code.

Companion document: `legacy-editor-keyboard-behavior-recovery.md` (evidence
layer — the recovered old-editor matrix this ODR will eventually be
reconciled against). This document is the decision/invariant layer; that one
is the evidence layer. Same relationship as
`docs/editor-architecture-decisions.md` to `docs/editor-research/`.

---

## Baseline invariants (frozen)

### ENTER-E1 — Enter at end-of-content creates a same-level sibling

**Statement:** For every supported block/list construct, when the selection
is empty and the caret is exactly at the end of the current item's content,
pressing Enter must create a new sibling at the same structural level and
place the caret at the new sibling's content start.

**Expected structural property:** same parent + same depth + same construct
family — not merely visually similar text. A same-family, same-depth,
same-parent sibling is the pass criterion; a visually plausible but
structurally different result (wrong depth, wrong parent, family
conversion, e.g. bullet silently becoming paragraph) is a failure even if
the rendered text looks plausible.

**Caret position, recorded exactly:**
- **Before:** end of current item's content (collapsed selection).
- **After:** start of the new sibling's content (collapsed selection).

**Required test coverage** (this invariant must be explicitly exercised by
a test for each of the following, not inferred from a subset):

1. Top-level bullet
2. Nested bullet
3. Top-level ordered list
4. Nested ordered list
5. Task
6. Nested task
7. Mixed list/task nesting (e.g. task nested under bullet, or vice versa)
8. Deeper nesting levels (3+ levels deep)
9. Bullet → bullet (family preserved across the Enter)
10. Ordered → ordered (family preserved across the Enter)
11. Task → task (family preserved across the Enter)
12. Mixed constructs where the current item has children (Enter on a
    parent item that already has nested children below it)

Each test case must record the exact caret position before and after Enter
(not just "caret moved to new line"), and must assert same parent + same
depth + same construct family for the resulting sibling.

This invariant is foundational: subsequent Enter, Backspace, Tab,
Shift+Tab, Delete, and arrow-key interaction tests build on top of it and
may assume ENTER-E1 holds unless a test specifically targets a case where
it's expected not to apply (e.g. Enter on an empty item, which is a
distinct, separately-specified behavior, not covered by ENTER-E1).

### ENTER-E2 — Enter inside item content splits into a same-level sibling

**Statement:** When the selection is empty and the caret is within an
item's content:

- **At the start of content / immediately after the marker:** Enter
  creates a new same-level sibling containing the original content.
- **In the middle of content:** Enter splits the content at the caret; the
  suffix moves to a new same-level sibling.
- **At the end of content:** this is already **ENTER-E1** — creates an
  empty same-level sibling.

**Examples:**

```text
- |Bullet
```

Enter →

```text
-
- |Bullet
```

```text
- Bullet| text
```

Enter →

```text
- Bullet
- |text
```

Nested:

```text
- Parent
  - One| Two
```

Enter →

```text
- Parent
  - One
  - |Two
```

**Expected structural property:** the resulting item must be a sibling of
the original item at exactly the same structural level. It must not become
a child, continuation line, plain paragraph, or otherwise change nesting.

**Do not generalize** this into a single "Enter creates list item" test.
Caret position is an explicit dimension of the behavior matrix, not a
detail to collapse away.

**Required test coverage** — this requirement applies across each of:

1. Bullet
2. Ordered list
3. Task
4. Nested bullet
5. Nested ordered list
6. Nested task
7. Mixed list/task nesting
8. Deeper nesting

—crossed with each of these caret-position dimensions, kept as **separate**
test cases (not collapsed into one representative position):

1. Before the marker
2. Inside the marker
3. Immediately after the marker
4. At the first content character
5. Middle of content
6. Immediately before the last character
7. End of content (ENTER-E1)

**Important:** before-marker and inside-marker behavior must **not** be
assumed to follow ENTER-E2. They require their own expected behavior and
their own explicit tests — do not infer them from the content-position
cases above.

**Recorded per case:** exact input text, caret position, operation,
resulting text, resulting syntax tree, nesting/parent identity, and final
caret position — for every case in the cross product above.

This is still ODR/matrix construction and freeze mode. Recording this
invariant is not authorization to implement fixes or change editor
behavior based on it.

### ENTER-E3 — Empty-item Enter / progressive dedent

**Statement:** When the current list item contains no content after its
marker and the selection is empty:

1. **Top-level / level 0**

   ```text
   - |
   ```

   Enter →

   ```text
   |
   ```

   The list marker is removed and the caret remains on the plain empty
   line.

2. **Nested / level > 0**

   ```text
   - Parent
     - |
   ```

   Enter →

   ```text
   - Parent
   - |
   ```

   The empty item remains a list item but is dedented by exactly one
   level.

3. **Repeated Enter must progressively dedent:**

   ```text
   - Parent
     - Child
       - |
   ```

   Enter →

   ```text
   - Parent
     - Child
     - |
   ```

   Enter →

   ```text
   - Parent
   - |
   ```

   Enter →

   ```text
   - Parent
   |
   ```

**Therefore:**
- empty item + Enter + depth > 0 → depth decreases by exactly 1
- empty item + Enter + depth = 0 → marker is removed

This is a separate behavior from **ENTER-E1** (end-of-content) and
**ENTER-E2** (content splitting).

**Required test coverage** — test E3 independently for:

1. Top-level bullet
2. Nested bullet
3. Deeply nested bullet
4. Top-level ordered list
5. Nested ordered list
6. Deeply nested ordered list
7. Top-level task
8. Nested task
9. Deeply nested task
10. Mixed bullet → ordered → task nesting
11. Mixed ordered → bullet → task nesting
12. Different marker characters where applicable

**Also test continuation sequences, not just static starting documents.**
For example:

```text
- Parent
  - Child|
```

Enter must first produce the empty-sibling state (ENTER-E1), and the next
Enter must then apply E3 to that newly-created empty item.

**Recorded after every individual Enter:**

1. Exact document text
2. Syntax tree
3. Item's parent identity
4. Structural depth
5. Marker family/type
6. Task state, where applicable
7. Exact caret position

Do not infer behavior from visual indentation alone.

This is still ODR/matrix construction and freeze mode. Recording this
invariant is not authorization to implement a fix or change existing tests.

---

## Backspace — List-marker/content boundary transition

**Statement:** Backspace must be tested as a state sequence, not just as
isolated keystrokes.

While the caret is inside list-item content, Backspace deletes content
normally. When repeated Backspace reaches the separator between the list
marker and the item's content, the next Backspace crosses that boundary.

After the marker/content separator is removed, the visible marker must be
treated as ordinary editable text, not as protected structural list
markup. Subsequent Backspace/Delete operations must therefore operate on
it as normal text.

**Exact transition to capture:**

```text
- Text|
```

repeated Backspace →

```text
- |
```

boundary Backspace →

```text
-|
```

At this point explicitly inspect the syntax tree and establish whether
`ListMark` still exists or whether `-` is now literal text. Then test
another Backspace and Delete.

**Required test coverage** — repeat this matrix for:

1. `-`
2. `*`
3. `+`
4. Ordered `1.`
5. Ordered `1)`
6. Unchecked task `- [ ]`
7. Checked task `- [x]`
8. Nested versions
9. Multiple nesting depths
10. One/multiple spaces after marker
11. Empty item
12. Content reduced character-by-character

**Recorded for every transition:**

1. Exact input text
2. Caret position
3. Key pressed
4. Resulting text
5. Syntax tree before/after
6. Whether `ListMark`/task markup still exists
7. Structural depth/parent identity
8. Final caret position

**Also test the reverse direction with Enter**, because this creates an
important mixed sequence:

```text
Backspace → Enter → Backspace → Enter
```

and similar sequences. Do not assume an isolated-key result remains valid
after another operation has changed the syntax tree.

The important thing isn't merely "Backspace removes the marker"; it's what
semantic state the editor enters after crossing that boundary.

This is ODR/matrix capture only. Recording this requirement is not
authorization to change implementation or existing tests.

---

## Mixed-sequence — Indentation + Backspace → marker boundary → Enter

**Statement:** When the caret is inside the indentation whitespace before a
nested list item, each Backspace removes one indentation level.

**Example:**

```text
- Parent
   |- Child
```

Repeated Backspace operations progressively reduce the indentation until
level 0:

```text
- Parent
  |- Child
```

```text
- Parent
 |- Child
```

```text
- Parent
|- Child
```

At level 0, the caret is immediately before the item's marker:

```text
- Parent
|- Child
```

At this point, Backspace is no longer removing indentation. The behavior
becomes the marker-boundary behavior already captured under
[Backspace — List-marker/content boundary transition](#backspace--list-markercontent-boundary-transition).

**Critical Enter continuation:** after reaching the level-0 marker
boundary, pressing Enter must create a sibling while preserving the
current item's construct/marker family.

For a normal bullet:

```text
- Parent
|- Child
```

Press Enter:

```text
- Parent
- Child
```

For a task, the starting state must explicitly be tested as:

```text
- Parent
|- [ ] Child
```

Press Enter:

```text
- Parent
- [ ] Child
```

It must remain a task. It must not become a plain bullet.

**This must be recorded as a multi-step state transition**, not merely as
separate Backspace and Enter cases:

```text
nested item → Backspace → Backspace → … → level-0 marker boundary → Enter → sibling preserving construct
```

**Required test coverage** — test the same pattern for:

1. Bullet
2. Task `[ ]`
3. Checked task `[x]`
4. Ordered list
5. Nested variants
6. Mixed parent/child marker families

**Recorded for every step:**

1. Exact source text
2. Syntax tree
3. Indentation level
4. Caret position
5. Resulting construct/marker type

**Also include the reverse/mixed sequences**, where the resulting state
becomes the input to the next operation:

- Enter → Backspace
- Backspace → Enter
- Backspace → Backspace → Enter
- Repeated Backspace → Enter → Backspace

This is documentation/ODR work only. Recording this requirement is not
authorization to implement or change code.

---

## Enter — Caret adjacent to a following marker (right-hand construct lookahead)

**Correction to the Enter ODR:** we must explicitly test Enter when the
caret sits immediately before the marker of the *following* item, not only
when the caret is inside the current item's own text.

**Example:**

```text
- Parent|- [ ] Task
```

The caret is immediately before the `- [ ]` marker of the Task. Pressing
Enter must create a new line/sibling while preserving the right-hand
item's construct:

```text
- Parent
- [ ] Task
```

It must **not** create a plain bullet merely because the caret is
currently at the end of the preceding item's text.

**Required test coverage** — the same boundary must be tested with:

```text
- Parent|- Child
- Parent|1. Child
- Parent|- [ ] Task
- Parent|- [x] Task
```

**Key rule to capture:** when Enter is pressed immediately before an
existing Markdown marker, the construct represented by the marker
immediately to the right of the caret must be considered when determining
the resulting sibling type — not just the construct to the left.

**Recorded per case:**

1. Exact caret position
2. Left-hand construct
3. Right-hand construct
4. Marker type
5. Resulting construct

This must also be included in mixed sequences where the preceding
operation changed the caret position, e.g. Backspace → Enter.

This is a distinct axis from the caret-position dimensions already
recorded under ENTER-E1/E2/E3: not just *where* the caret is relative to
the text, but *which construct owns the characters immediately to the left
and right of the caret*.

Do not implement yet — this adds cases to the ODR and interaction matrix
only.

---

## Backspace + indentation whitespace — investigation (not yet a decision)

**Status:** investigation only, feeding the Backspace ODR section above. No
Backspace behavior has been decided or changed as a result of this
investigation; it establishes what the editor does today and why, so the
eventual ODR decision is made against verified facts rather than assumption.

Full findings, live-executed against the real extension stack (no
production code or test files modified — a scratch spec was created,
used, and deleted): [backspace-indentation-investigation.md](./backspace-indentation-investigation.md).

**Summary of what was verified [A] (directly observed by executing the real
code):**

- The three questions posed (literal-character deletion / indentation
  tab-stop boundaries / Markdown structural nesting levels) do not have a
  single answer — **three different, competing handlers** can claim
  Backspace depending on exact caret column, and which one wins is not a
  simple function of nesting depth:
  - Clutter's own `deleteMarkupBackwardSubtreeAware` (structural,
    marker-preserving subtree dedent) — but it **only ever fires when the
    caret is exactly at an item's content-start column**. Caret anywhere in
    the leading whitespace *before* the marker never reaches it.
  - Upstream `deleteMarkupBackward` (`@codemirror/lang-markdown`) — claims
    some but not all marker-adjacent columns, inconsistently relative to
    nesting depth.
  - CM6's generic `deleteCharBackward` — indentation/tab-stop-boundary
    based (mod-`indentUnit`, default 2), the same mechanism plain-paragraph
    leading whitespace uses. This is what actually handles most
    caret-before-marker cases, meaning that region of a list item behaves
    like generic text indentation, not list structure, today.
- A tab character in leading whitespace is always deleted atomically as
  one unit, regardless of its expanded visual width; mixed tab+space
  indentation degrades to slower, less "unit-like" deletion.
- At and beyond a width threshold tied to the parent's own content column
  (not a fixed constant), a visually-nested line stops parsing as a nested
  `ListItem` at all and becomes lazy-continuation content of the parent —
  correct per CommonMark, not a bug, but easy to reintroduce accidentally
  if re-derived from scratch without this document.
- Nested-ordered-list Backspace-dedent relocates an item without
  renumbering either list it leaves or joins — a known, already-accepted
  gap, not new here.
- Caret literally inside a marker's own characters (e.g. between the digit
  and the `.` of an ordered marker) is undefended: Backspace there does a
  raw single-character deletion that can corrupt the marker into invalid
  syntax. Flagged as a case needing an explicit decision, not silently
  inherited into the new ODR.

**Open questions this document deliberately leaves undecided** (from the
investigation's own §3, carried here so they aren't lost): whether
caret-before-marker Backspace should ever reach Clutter-authored logic at
all; whether the column immediately before content-start (one ArrowLeft
from the protected position) should get the same marker-preserving
protection; whether the `indentUnit`-modulo jump-deletion behavior is
desired product behavior or should be redefined against literal
one-character deletion, the parent's actual content-column width, or a
full structural dedent; and whether nested-ordered-list renumbering-on-dedent
should be closed as part of this work or continue to be deferred.

None of these are decided by this entry. They are inputs to the Backspace
ODR decision, to be resolved explicitly — not inferred — when that section
of the ODR is finalized.

---

## Not yet recorded

Everything else in the eventual ODR/test matrix (Backspace, Tab/Shift-Tab,
Delete, Arrow-key invariants; Enter-on-empty-item; Enter at document end;
Shift+Enter) is out of scope for this entry and must be added as its own
reviewed, frozen invariant — not inferred from ENTER-E1.
