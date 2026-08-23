# Canonical Keyboard ODR v2 — Authoritative Indentation Contract

**Status: documentation/specification only. Implementation remains frozen
until §7 (Remaining Contradictions) is resolved.** No production code or
test files are modified by this document.

This consolidates and supersedes
[canonical-keyboard-odr-v1.md](./canonical-keyboard-odr-v1.md): the
3-space canonical unit is no longer "PROPOSED" — it is **adopted, by
operator decision**, as the authoritative indentation model. What changes
from v1 is not the empirical findings (all preserved, cited below) but
their status: v1's "Contradiction Log" (C1–C3) is resolved in favor of the
3-space model, and every keystroke section is reworked to reference it as
the single shared contract rather than listing competing per-key models.

What is **not** resolved by adoption: §7 lists concrete cases, derived
from the same verified facts, where a naive uniform "always add/remove
exactly 3 spaces" implementation will not produce parser-recognized
nesting. These are not re-litigations of C1–C3 — they are new, more
specific findings that surface only once 3-space-per-level is taken as
given. They must be resolved explicitly before implementation begins, per
the operator's own instruction not to silently choose behavior where the
contract is ambiguous.

Companion/evidence documents (retained, not rewritten, per this archive's
own no-rewrite convention):
[keyboard-odr-test-matrix.md](./keyboard-odr-test-matrix.md),
[backspace-indentation-investigation.md](./backspace-indentation-investigation.md),
[legacy-editor-keyboard-behavior-recovery.md](./legacy-editor-keyboard-behavior-recovery.md),
[canonical-keyboard-odr-v1.md](./canonical-keyboard-odr-v1.md) (historical).

---

## 1. The Authoritative Indentation Contract

### 1.1 Canonical unit and representation

Clutter uses **3 spaces as the canonical indentation unit**. Indentation
is represented **entirely by actual leading whitespace in the document** —
there is no separate persisted "nesting level" value anywhere in the
editor or its data model.

```text
0 spaces → level 0
3 spaces → level 1
6 spaces → level 2
9 spaces → level 3
```

### 1.2 Arbitrary whitespace uses the same unit

Any leading-whitespace count, including ones that are not exact multiples
of 3, is interpreted with the same unit:

```text
completeUnits = floor(N / 3)
remainder      = N % 3
```

```text
5  → 3 + 2
7  → 3 + 3 + 1
8  → 3 + 3 + 2
10 → 3 + 3 + 3 + 1
```

**The remainder is real document whitespace.** It must not be silently
discarded, rounded, or renormalized unless a specific keyboard operation's
contract, documented below, explicitly calls for normalization. Absent
such an explicit rule, the remainder is preserved exactly as-is through
any operation that doesn't directly target it.

### 1.3 One shared model across every key

Tab, Shift+Tab, Enter, Backspace, and any future indentation-aware
operation read and write this same whitespace representation. There is no
independent "nesting level" logic per key — every operation's contract
below is stated in terms of §1.1/§1.2, not a separate abstraction.

### 1.4 Structural Markdown behavior stays separate from indentation amount

The 3-space contract determines **indentation** — how much leading
whitespace a line has, and what keyboard operations do to that whitespace.
It does not determine **Markdown structure** — whether a line is a
sibling, a child, a lazy continuation, a task, an ordered item, etc. That
is the parser's job, applied to the whitespace the indentation contract
produces. Keyboard commands manipulate whitespace/markers according to
§1.1–§1.3; the parser then determines structure from the resulting
document, same as it always has. Do not conflate "how much we indented"
with "what the parser decided that indentation means" — §7 exists
precisely because these two are not guaranteed to agree.

### 1.5 Per-operation whitespace cases (<3, ==3, >3-with-remainder)

Required by the operator explicitly; stated once here so every keystroke
section in §3–§6 can reference it instead of re-deriving it:

| Current leading whitespace | Tab | Shift+Tab | Backspace (caret in leading indentation) | Enter (deriving sibling indentation) |
|---|---|---|---|---|
| **0** (level 0) | Add 3 → becomes 3 | No-op (nothing to remove) — matches existing "always consumed, no change" contract for at-top-level Shift+Tab | Deletes into the preceding line/content per non-indentation rules; not an indentation case | Sibling indentation = 0 (unchanged) |
| **< 3, no full unit** (e.g. 1 or 2) | Add 3 → becomes 4 or 5 (existing partial width is preserved underneath the new unit, not rounded away first) — **flagged in §7.4, not fully specified by the operator's instructions** | **Unspecified by the operator's contract as given — flagged in §7.4.** Naive options: remove all of it (partial-unit + no-remainder-to-preserve), or no-op (nothing is a "complete unit"). Not decided here. | **Unspecified — same gap, flagged in §7.4.** Does Backspace remove one whitespace char at a time below a full unit, or something else? | Sibling copies existing partial whitespace as-is (§1.2's "remainder is real, preserved" default) |
| **== 3** (exact level 1) | Add 3 → becomes 6 | Remove 3 → becomes 0 | Remove 3 → becomes 0 | Sibling indentation = 3 |
| **> 3 with remainder** (e.g. 5 = 3+2) | Add 3 → becomes 8 (5+3; the existing remainder is carried forward untouched, per §1.2) | **Remove exactly one 3-space unit, preserving the remainder** — operator-specified explicitly: 5 → 2 | Remove exactly one 3-space unit, preserving the remainder, per the same model Shift+Tab uses (operator: "remove one 3-space indentation unit according to the same whitespace model") — 5 → 2 | Sibling indentation = existing amount unchanged (5), remainder preserved per §1.2 — **whether this should instead normalize to a clean multiple of 3 is flagged in §7.5, not decided here** |

### 1.6 [NEW] Tab / Shift+Tab are list-only

**Operator-adopted, resolved, not a candidate:** Tab and Shift+Tab are
scoped to list structure only. They are not a general editor-indentation
mechanism.

- **Tab on an ordinary paragraph → no-op.** No document change; the
  keystroke is not claimed for indentation purposes (whether it should
  fall through to native browser focus-navigation or simply be consumed
  with no change is an implementation-precedence detail for the Tab
  milestone, not decided here — but "increase paragraph indentation" is
  ruled out either way).
- **Shift+Tab on an ordinary paragraph → no-op.** Same reasoning.
- **Tab may indent a `ListItem` and its applicable subtree.** Unchanged
  from §3's existing contract — only the paragraph case is newly excluded.
- **Shift+Tab may outdent a `ListItem` and its applicable subtree.**
  Unchanged from §4's existing contract.
- **One shared indentation model, not two.** §1.1–§1.5's 3-space contract
  is the *only* indentation model Tab/Shift+Tab ever apply — there is no
  longer a separate paragraph-indentation model to reconcile against it.
  This retires the question v1/v2 previously carried about whether
  plain-paragraph Tab is in scope for the 3-space contract (raised in the
  old §6/Enter section and §7.5's normalization question, insofar as it
  touched paragraphs): it is not in scope, because plain-paragraph Tab no
  longer does anything.
- **This is a product-contract change from current production
  behavior**, not merely a restatement: `paragraphIndentKeymap.ts`
  currently *does* indent plain paragraphs (via CM6's generic
  `indentMore`/`indentLess`, gated to non-list, non-blockquote,
  non-table, non-code contexts). That implementation is **preserved
  as-is until the Tab implementation milestone begins** — this document
  changes the target contract, not the running code (see §1.6.1).

#### 1.6.1 Implementation-status note (not a contradiction — a scheduling statement)

Current production still indents plain paragraphs on Tab. This is a known,
intentional, temporary divergence between the ODR (target) and the running
code (current), tracked the same way every other not-yet-implemented
section of this document already is — it does not go in §7 because it is
not ambiguous or undecided, only not-yet-done. `paragraphIndentKeymap.ts`
and its call site in `markdownTabKeymap.ts` are the concrete pieces of
production code the eventual Tab/Shift+Tab implementation pass must
either delete or reduce to an explicit no-op; no code changes accompany
this documentation update.

---

## 2. The finite behavioral matrix (definition, not blind BFS)

Per the operator's instruction: derive a finite, exhaustive matrix from
the contract rather than searching blindly. The matrix is the Cartesian
product of these **closed, enumerated** dimensions. Every cell is a single
test case; every test asserts the 7 fields in §2.6. This section defines
the matrix — populating every cell is the next authoring pass once §7 is
resolved, not done here.

### 2.1 Operation dimension (9 values)

`Tab`, `Shift+Tab`, `Enter`, `Backspace`, `Enter→Backspace`,
`Backspace→Enter`, `Tab→Enter`, `Enter→Tab→Backspace→Enter`, and the
remaining pairwise/triple sequences enumerated in full in §6.1 (13 named
sequences there, folded into this dimension as additional rows rather than
a separate matrix).

### 2.2 Caret-position dimension (13 values — the taxonomy already frozen in `keyboard-odr-test-matrix.md`, restated here as the authoritative list)

1. Before indentation (start of line, indentation present)
2. Inside indentation (mid-whitespace-run)
3. After indentation, before marker (indentation done, marker not yet started — only distinct from #2 when marker itself has a detectable start boundary, e.g. this coincides with #2 for simple cases)
4. Before marker (equivalent framing of #3, kept as its own row since prior frozen docs used this exact term)
5. Inside marker (e.g. between the digit and `.` of an ordered marker)
6. Immediately after marker
7. Immediately after marker + separator (the space between marker and content — distinct from #6 when the separator is more than one space)
8. At text start (first content character)
9. In the middle of text
10. At text end
11. On an empty marker-only line
12. At a block boundary (e.g. end of document, adjacent blockquote/table/code fence)
13. With a non-empty selection (selection-replace variant of every above position, where applicable)

### 2.3 Indentation-amount dimension (closed set, not open-ended)

`0, 1, 2, 3, 4, 5, 6, 7, 8, 9` leading spaces (covers level 0 through
level 3 plus every remainder pattern up to one full extra unit beyond
level 3, per §1.2's own worked examples), plus one deeper representative
value (`12`, level 4) to confirm the pattern holds beyond the small cases.
11 values.

### 2.4 Construct-family dimension (6 values)

Bullet, task (unchecked), task (checked), ordered (1-digit), ordered
(2-digit, e.g. `10.`), mixed (parent one family, child another — itself
needing the sub-dimension in §2.5).

### 2.5 Structural-context dimension (7 values)

Top-level (no parent), nested one level, nested two+ levels, item with
its own children below it, first item in a list, last item in a list,
mixed-family ancestor chain (e.g. bullet → ordered → task).

### 2.6 Required assertions per matrix cell (the operator's 7 fields)

Every populated cell must assert, after the operation (or after the full
sequence, for chained operations in §2.1's sequence rows):

1. Resulting document text (exact string)
2. Caret/selection position (exact offset or range)
3. Parsed Markdown tree (node names/shape, not just text)
4. Marker type/state (family, checked/unchecked, ordered digit value)
5. Indentation amount (leading-whitespace count, expressed per §1.2)
6. Structural relationship to surrounding items (parent/sibling/child, by
   tree identity, not visual indentation alone)
7. Whether the operation was handled or deferred (which command in the
   precedence chain actually claimed the keystroke — Clutter's own
   structural code, upstream `deleteMarkupBackward`/`markdownKeymap`, or
   CM6's generic fallback — since §7's own findings show this is not
   always the command a naive reading would expect)

### 2.7 Matrix size (for scoping the authoring pass, not to be treated as a target to hit blindly)

`9 (operations) × 13 (caret positions) × 11 (indentation amounts) × 6
(construct families) × 7 (structural contexts)` is the raw product
(~54,054) but the overwhelming majority of cells are **structurally
inapplicable** (e.g. "inside marker" only applies where a marker exists at
all; "indentation amount" is meaningless for a top-level item with no
parent in most operations). The actual authoring pass should enumerate
only applicable cells per operation — each keystroke section in §3–§6
below states its own applicable sub-matrix rather than inheriting the full
product.

---

## 3. Tab — reworked against §1

**Scope, per §1.6: list-only.** Tab claims the keystroke only when the
selection resolves to `ListItem` context. On an ordinary paragraph, Tab is
a **no-op** — not a smaller indentation step, not a fallback to a
different model, nothing. There is exactly one indentation model (§1.1–§1.5),
and paragraphs are simply outside this command's scope entirely.

**Contract (list context):** adds exactly one 3-space indentation unit to
every line in the selected item's subtree (mirrors the existing
subtree-wide application already correct in production — see §7.1 for the
one place this still needs reconciling). See §1.5 for the 0/<3/==3/>3
cases.

**Preserved from prior investigation, reframed:** the *mechanism* already
in production (`listIndentKeymap.ts`'s `indentListItem`) — applying the
delta across an item's whole subtree so descendants move with it — is
correct and should be preserved. What changes under §1 adoption is the
**delta computed**: previously computed as "target sibling's own
`contentColumn`" (construct-width-dependent), must become "exactly 3,
always" per §1.1/§1.3. This is the concrete implementation change §7.1
flags as needing reconciliation with parser nesting recognition before
it's safe to make.

**What retires under §1.6:** `paragraphIndentKeymap.ts`'s `indentParagraph`
command (CM6 `indentMore`-based, plain-paragraph Tab) is no longer part of
the target contract. Its production code is untouched by this
documentation pass (§1.6.1) but must be deleted or reduced to a no-op when
Tab implementation begins — not migrated, not "kept as a fallback model."

**Applicable sub-matrix:** caret positions #1, #2, #8–#11, **within list
context only** (Tab is whole-line/whole-item scoped, not
caret-column-scoped, so marker-internal caret positions #5–#7 don't change
Tab's behavior — confirm this is still true after adoption, not assumed);
indentation amounts 0,3,5,6,9 (representative: level 0, exact level,
remainder case, exact level 2, exact level 3); all 6 construct families;
structural contexts: top-level, nested, deepest-tested-level,
first/last-in-list. Plus, explicitly, **one paragraph-context cell: "Tab
on an ordinary paragraph → no-op"** — required coverage per §1.6, not
optional or implied by the list-context cells above.

---

## 4. Shift+Tab — reworked against §1

**Scope, per §1.6: list-only**, mirroring §3. On an ordinary paragraph,
Shift+Tab is a **no-op** — same reasoning as Tab, not a smaller-outdent
fallback.

**Contract (list context):** removes exactly one 3-space indentation unit
when one exists, **preserving any remainder** — operator-specified
explicitly (§1.5 row 4). Applied across the item's whole subtree, same
mechanism as Tab.

**Top-level list item + Shift+Tab:** no-op, document unchanged — but the
keystroke is still consumed within list context (matches the existing
"always consumed once list context is established" contract already
correct in production for the at-top-level case). This is distinct from
the paragraph no-op: a top-level list item's Shift+Tab no-op is list
context claiming the key and choosing not to change anything; a
paragraph's Shift+Tab no-op is the command never claiming the key at all.
Both need their own explicit test — do not conflate them.

**Sub-3-unit case (§1.5 row 2) is not specified by the operator's own
instructions and is not decided here** — flagged in §7.4.

**Preserved from prior investigation, reframed:** production's existing
`dedentListItem` mechanism (subtree-wide delta application) is preserved;
the delta computed changes from "sibling/grandparent's `contentColumn`" to
"exactly 3, remainder preserved" per §1.1/§1.5.

**What retires under §1.6:** `paragraphIndentKeymap.ts`'s `dedentParagraph`
command, same disposition as `indentParagraph` in §3 — untouched by this
documentation pass, to be deleted or reduced to a no-op when the
Tab/Shift+Tab implementation milestone begins.

**Applicable sub-matrix:** same shape as §3, plus the remainder-specific
cases (5→2, 7→4, 8→5) called out explicitly since they're the operator's
own worked examples and must not be silently dropped from the matrix; plus
the same required **paragraph-context no-op cell**, and the top-level
list-item no-op cell called out above kept distinct from it.

---

## 5. Backspace — reworked against §1

**Contract:** when the caret is inside leading indentation, Backspace
removes one 3-space indentation unit according to the §1 model — **not**
arbitrary individual characters, and **not** the CM6-default
tab-stop-modulo-2 behavior empirically observed pre-adoption
(`backspace-indentation-investigation.md` §1.3). This is a direct,
named change from currently observed behavior — see §7.2.

**Distinct from indentation-Backspace** (must not be merged into one
case, restating the frozen requirement from `keyboard-odr-test-matrix.md`):

- Ordinary text deletion (caret positions #8–#10, inside real content)
- Deletion of indentation (caret position #2, this section's own scope)
- Marker deletion (caret position #5, inside the marker itself — the
  corruption-producing gap already flagged `[A]` in
  `backspace-indentation-investigation.md`, **still unresolved, not
  addressed by the indentation contract at all** — restated in §7.3)
- Structural list dedent (caret position #6/#8, at content-start —
  production's existing marker-preserving `deleteMarkupBackwardSubtreeAware`,
  preserved as a mechanism per §3's note, delta recomputed to exactly 3)
- Deletion at content start (alias of the above)
- Deletion immediately before a marker (caret position #4 — this is the
  position `backspace-indentation-investigation.md` §1.5 found never
  reaches Clutter's own structural code at all; under §1 adoption it
  **should**, per the contract's own "Backspace... remove one 3-space
  indentation unit" language, but doing so requires the fix flagged in
  §7.2, not merely a documentation update)
- Deletion after a marker (caret position #6/#7 — the marker/content
  boundary transition already frozen in `keyboard-odr-test-matrix.md`,
  unaffected by the indentation-amount contract, restated not replaced)

**Applicable sub-matrix:** caret positions #1–#7 (every indentation- and
marker-adjacent position); indentation amounts 0,1,2,3,4,5,6,7,8,9; all 6
construct families; structural contexts: top-level (no-op case), nested
one level, nested two+ levels.

---

## 6. Enter — reworked against §1

**Contract:** when continuing or splitting a structural line, the
resulting sibling's leading whitespace is **derived from the same §1
representation the source line already has** — copied, not recomputed
from a separate nesting-level calculation. This preserves and generalizes
ENTER-E1/E2/E3 (`keyboard-odr-test-matrix.md`) without altering their
caret-position logic — only the *indentation arithmetic* changes to
reference §1 instead of being left implicit.

- **ENTER-E1** (end-of-content → same-level sibling): sibling indentation
  = current item's indentation, exact copy, whatever §1.2 remainder it has.
- **ENTER-E2** (split-at-caret → same-level sibling): same rule, applied
  to the suffix's new line.
- **ENTER-E3** (empty-item → progressive dedent): "depth decreases by
  exactly 1" is now precisely "leading whitespace decreases by exactly one
  3-space unit" per §1.1 — this resolves the ambiguity v1 flagged (§2.1 of
  v1, ENTER-E3 row) between "one level" and "one canonical unit": under
  adoption, they are the same thing, by definition, **once §7.1/§7.2 make
  the underlying mechanism actually operate in 3-space units**.
- **Right-hand-marker lookahead** (Enter before a following marker):
  unaffected by the indentation-amount contract — this is a construct-type
  rule (§1.4), orthogonal to whitespace width, restated not replaced.
- **Marker type is independent of indentation** (§1.4): Enter must
  preserve/create the marker type appropriate to context, never copy
  indentation and marker as a single coupled decision.

**Whether a non-multiple-of-3 existing indentation should be normalized
when Enter creates a sibling, rather than copied as-is, is flagged in
§7.5 — not decided here.**

**Applicable sub-matrix:** caret positions #4–#11 (every text/marker
position Enter can meaningfully fire from, per the full list already
required in `keyboard-odr-test-matrix.md`); indentation amounts
0,3,5,6,9; all 6 construct families; structural contexts: item with no
children, item with children (must remain a sibling of the parent, not a
child of the item's own children), first/last-in-list, mixed-family
ancestor chain.

---

## 7. Remaining Contradictions and Unresolved Product Decisions

Per the operator's own instruction: **do not silently choose behavior
where the contract is ambiguous.** Nothing below is decided by this
document. Implementation stays frozen until each is either resolved by
explicit operator decision or ruled out of scope.

### 7.1 Fixed 3-space-per-level does not always reach the parser's own nesting-recognition threshold — CORRECTED, now `[A]`-verified

**Correction notice:** this section previously claimed, at `[B]`
(reasoned, not executed) confidence, that task-item parents required
child indentation `>= 6` and would therefore contradict a fixed 3-space
unit. **That specific claim was wrong** — it assumed a task's own
`contentColumn()` value (checkbox-inclusive, 6) is also the value the
*parser* uses to decide nesting. Live-executing the real parser this pass
(`markdownLanguageExtension()`, real `syntaxTree` output, scratch spec
created and deleted, no production files touched by the verification
itself) disproves that assumption directly. Per this archive's own
no-silent-correction rule, the wrong claim is struck through in spirit and
replaced here with the verified rule, not silently edited away.

**Verified rule (`[A]`, live-executed):** the parser's nesting-recognition
window for a child is governed by the **parent's own `ListMark` node
width alone** — never by anything belonging to a `Task` node. A task
parent's checkbox (`[ ]`/`[x]`) is parsed as content *inside* the `Task`
node, sitting alongside (not extending) the base `ListMark`-driven
nesting math. Concretely:

- **Any `BulletList` item — plain bullet *or* task, checked or
  unchecked — uses the identical window: child indentation must be `>=
  ownIndent + 2` and `< ownIndent + 6`.** Verified directly: a 3-space
  child nests correctly under a task parent (`- [ ] Parent\n   - Child`
  produces a genuinely nested `BulletList` inside the parent `ListItem`);
  a 1-space child does not (produces a sibling `ListItem`, not nested); a
  6-space child does not either (the child line stops appearing as a
  `ListItem`/`Paragraph` in the tree at all — the same lazy-continuation
  absorption already documented for plain bullets). **Task-ness has no
  effect on the threshold.** The earlier claim that task parents need `>=
  6` is retracted.
- **`OrderedList` items use their real, full marker width** (digit count
  + delimiter + separator) as both the lower window bound and — per the
  same `+4` pattern — the upper bound: 1-digit `"1. "` → window `[3, 7)`;
  2-digit `"10. "` → window `[4, 8)`; 3-digit `"100. "` → window `[5, 9)`.
  This part of the original finding is unchanged, and is now itself
  `[A]`-verified rather than `[B]`-reasoned: a 3-space child under a
  2-digit ordered parent was directly confirmed to produce a **sibling
  `ListItem` in the same list**, not a nested child, not even a
  lazy-continuation paragraph — a more specific (and more surprising)
  failure mode than "not recognized as nested" alone conveys. A 4-space
  child (the parent's real content column) was confirmed to nest
  correctly.

**Revised worked cases**, chaining §1's fixed-3-per-level rule against the
*correct* per-family threshold:

- **Pure bullet chains: safe.** Unchanged from the original finding — 1
  space of margin at every depth tested.
- **Task-parent chains: safe, not a contradiction.** Corrected from the
  original finding — a task parent's nesting threshold is identical to a
  plain bullet's, so a 3-space child nests exactly as safely (1 space of
  margin). **Mixed chains where a task sits anywhere in the ancestor
  chain are therefore also safe**, contrary to what this section
  previously claimed.
- **Pure 1-digit-ordered chains: safe but with zero margin.** Unchanged —
  each level lands exactly at the window's inclusive lower bound.
- **A 2-digit-or-longer ordered parent: still the one real
  contradiction**, now `[A]`-verified rather than assumed. A 3-space
  child under a `"10."`-family parent produces a **sibling list item**,
  not a nested child — silently wrong Markdown structure, not merely "the
  parser disagrees with our intent."

**Narrower, corrected scope of the open question:** the load-bearing
implementation question is **only** about ordered lists with a 2-or-more
digit marker (item numbers 10+, or any list long enough to reach one) —
not tasks, not bullets, not 1-digit ordered lists. Candidate resolutions,
listed only so the decision isn't made blind (none chosen here): (a) keep
§1's fixed-3 contract for every family except multi-digit ordered lists,
where the command computes the real required width instead — a
family-aware exception rather than a universal hybrid; (b) accept that
multi-digit-ordered nesting sometimes requires more than one canonical
unit and document it explicitly, rather than treating "1 unit = 1 level"
as universal; (c) resolve this at the parser/grammar level instead
(rejected by §1.4's own instruction not to "fix" parser behavior during
this pass, listed only for completeness). **Not decided here.**

### 7.2 Backspace must change from currently-observed behavior, not merely be redocumented

`backspace-indentation-investigation.md` established `[A]` that
caret-before-marker Backspace currently uses CM6's generic
`indentUnit`-modulo-2 snapping (or, for some widths, upstream
`deleteMarkupBackward`'s single-line edit) — never Clutter's own
structural code. Adopting §1 for Backspace is therefore **not a
documentation-only reconciliation** the way Tab/Shift+Tab's "recompute the
delta constant" change is — it requires Clutter's own Backspace-handling
code to newly claim a caret position it currently never reaches at all.
Flagged so the eventual implementation task isn't scoped as "just change
one constant" when it's actually "add new interception logic." Not
designed here.

### 7.3 Intra-marker Backspace corruption remains entirely unaddressed by §1

Restated from `canonical-keyboard-odr-v1.md` §2.2: Backspace with the
caret literally inside a marker's characters (e.g. between the digit and
`.` of an ordered marker) currently produces a raw single-character
deletion that can corrupt the marker into invalid syntax. Nothing in the
§1 indentation contract addresses this — it is a marker-integrity
question, not an indentation-amount question. Needs its own decision,
separate from indentation-contract implementation, before Backspace work
is considered complete.

### 7.4 Sub-3 whitespace behavior for Shift+Tab and Backspace is not specified by the operator's own contract

§1.5's table cells for "< 3, no full unit" under Shift+Tab and Backspace
are genuinely open — the operator specified the exact-3 and
greater-than-3-with-remainder cases explicitly but not this one. Candidate
behaviors (removing all of the partial whitespace vs. a no-op since no
full unit exists) are listed in §1.5 but neither is chosen. Must be
resolved before those two operations' sub-3 test cells can be authored.

### 7.5 Whether Enter should normalize a non-multiple-of-3 existing indentation, or preserve it exactly

§1.2 says the remainder "must not be silently discarded... unless a
specific keyboard operation's contract explicitly requires
normalization." Enter's own contract (§6) currently defaults to
"preserve exactly," per §1.2's own default — but this is a real product
question, not just an arithmetic one: pre-existing documents (pasted,
imported, or produced before this contract existed) may already contain
non-multiple-of-3 indentation, and every Enter-press on such a document
would perpetuate that remainder indefinitely rather than ever cleaning it
up. Whether that's desired (preserve user/import fidelity) or undesired
(drift toward a canonical-looking document over time) is not decided
here.

### 7.6 Nested-ordered-list renumbering-on-dedent (carried forward, unresolved)

Restated from prior work, unaffected by §1 adoption: Shift+Tab/Backspace
structural dedent relocates an item without renumbering either the list it
leaves or the one it joins. Still a named, accepted gap — whether closing
it is in scope for this implementation pass is not decided here.

---

## 8. Interaction-sequence and caret-taxonomy requirements (preserved)

Unchanged from `canonical-keyboard-odr-v1.md` §3–§4; restated here so this
document is self-contained as the new single source of truth.

### 8.1 Required sequences (chained — each result feeds the next operation)

```text
Enter → Backspace
Backspace → Enter
Tab → Enter
Enter → Tab
Tab → Backspace
Backspace → Tab
Shift+Tab → Enter
Enter → Shift+Tab
Delete → Enter
Enter → Delete
Backspace → Enter → Tab
Tab → Backspace → Enter
Enter → Backspace → Enter
Enter → Tab → Backspace → Enter
```

— each repeated across mixed construct-family transitions (bullet↔task,
task↔ordered, ordered↔bullet, and multi-level mixed-family chains).

### 8.2 Caret-position taxonomy

The 13-position list in §2.2 is the authoritative version of the taxonomy
first stated in `keyboard-odr-test-matrix.md`; use §2.2, not a
re-derivation, for every future keystroke section.

---

## 9. Delete and Arrow keys — status unchanged

Still out of scope for this consolidation pass, restated from
`canonical-keyboard-odr-v1.md` §2.5/§2.6: no investigation has been
executed this session for forward Delete or Arrow-key behavior in the
current CodeMirror editor. They are **not** given indentation-contract
rows here because doing so without evidence would be fabrication. §1's
contract applies to Delete "where indentation/nesting is involved" per the
operator's own instruction once that investigation happens — the
investigation itself is a prerequisite, not done by this document.

---

## 10. What this document does not do

- Does not implement any change to Tab, Shift+Tab, Backspace, or Enter —
  including §1.6's list-only scoping: `paragraphIndentKeymap.ts` still
  runs in production exactly as before until the Tab/Shift+Tab
  implementation milestone.
- Does not resolve §7.1–§7.5 — each is a named, explicit decision point.
- Does not populate the full matrix defined in §2 — that is the next
  pass, gated on §7.
- Does not fabricate Delete/Arrow-key findings (§9).
- Does not discard any previously discovered edge case (marker
  corruption, parser lazy-continuation threshold, nested-ordered-list
  renumbering gap) — each is carried forward and re-anchored to this
  document's structure rather than dropped for being inconvenient.

Production implementation begins only after §7 is resolved by explicit
operator decision, at which point §2's matrix should be populated in full
and tests authored directly from it, per the operator's own instruction.
