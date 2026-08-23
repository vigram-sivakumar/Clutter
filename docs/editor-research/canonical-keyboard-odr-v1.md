> **SUPERSEDED.** The 3-space canonical unit discussed here as "PROPOSED"
> has since been authoritatively adopted by the operator. This document is
> kept as the historical record of the investigation phase (the
> Contradiction Log in particular). The current, single source of truth is
> [canonical-keyboard-odr-v2.md](./canonical-keyboard-odr-v2.md) — read
> that one first.

# Canonical Keyboard ODR v1 — Indentation Contract + Retrofit (historical)

**Status: documentation/specification only. Implementation is frozen.** No
production code or test files are modified by this document. Nothing here
is implementation approval, and nothing here claims a behavior is correct
merely because it matches what the code currently does — see the
**Contradiction Log** (§1.5) for the one finding that blocks treating this
document as adopted.

Supersedes nothing — this is the consolidation layer sitting on top of the
existing evidence and frozen-invariant documents, per the same
evidence/decision split used throughout this thread:

- [keyboard-odr-test-matrix.md](./keyboard-odr-test-matrix.md) — the
  frozen Enter invariants (ENTER-E1/E2/E3), the marker-boundary Backspace
  section, the indentation+Backspace→Enter mixed sequence, and the
  right-hand-marker-lookahead correction. Retrofitted below, not replaced.
- [backspace-indentation-investigation.md](./backspace-indentation-investigation.md) —
  the `[A]`-tagged empirical findings on what Backspace-in-indentation
  actually does today. Retrofitted below, not replaced.
- [legacy-editor-keyboard-behavior-recovery.md](./legacy-editor-keyboard-behavior-recovery.md) —
  old-editor evidence, out of scope for this retrofit (different
  implementation entirely).

---

## 1. Canonical Indentation & Nesting Contract — v1 (PROPOSED)

Recorded exactly as specified by the operator. This is a **proposed**
contract, not yet reconciled with the empirically observed current
implementation — §1.5 states why it cannot be marked "adopted" as-is.

### 1.1 Standard indentation unit

Clutter uses **3 spaces as one indentation unit**, editor-wide, for all
indentation and nesting behavior:

```text
3 spaces  = 1 indentation unit
6 spaces  = 2 indentation units
9 spaces  = 3 indentation units
12 spaces = 4 indentation units
```

Applies to: Enter, Backspace, Tab, Shift+Tab, Delete (where
indentation/nesting is involved), list nesting, task nesting,
mixed/repeated keyboard sequences, and existing Markdown loaded into the
editor. There must not be separate indentation semantics per key.

### 1.2 Nesting is derived from actual leading whitespace

For `N` leading spaces:

```text
completeIndentUnits = floor(N / 3)
remainder            = N % 3
```

| N | units | remainder |
|---|---|---|
| 0 | 0 | 0 |
| 1 | 0 | 1 |
| 2 | 0 | 2 |
| 3 | 1 | 0 |
| 4 | 1 | 1 |
| 5 | 1 | 2 |
| 6 | 2 | 0 |
| 7 | 2 | 1 |
| 8 | 2 | 2 |
| 9 | 3 | 0 |

The remainder must **not** be interpreted as an additional nesting level:
`5 = 3 + 2` is one complete unit, not two; `7 = 3 + 3 + 1` is two complete
units, not three.

### 1.3 The source of indentation is irrelevant

Tab-created, manually typed, Enter-created, pasted, and pre-existing
imported-file spaces are equivalent if they produce the same document
whitespace. The editor reasons about resulting whitespace, not its
history. There is no separate concept of "Tab indentation" vs "manually
typed indentation."

### 1.4 Tab

Tab adds one 3-space indentation unit, no hidden nesting-level state:

```text
- Item
```
Tab →
```text
···- Item
```
Tab →
```text
······- Item
```
Tab →
```text
·········- Item
```

### 1.5 Shift+Tab

Shift+Tab removes one complete 3-space unit when one exists:

```text
······- Item
```
Shift+Tab →
```text
···- Item
```
Shift+Tab →
```text
- Item
```

**Remainder case explicitly unresolved by the contract as stated:** if the
document contains `5 = 3 + 2` leading spaces, Shift+Tab's behavior on the
`3 + 2` structure is not defined by §1–§10 and must be defined and tested,
not silently invented.

### 1.6 Backspace

Same indentation model. When the caret is inside leading indentation, the
ODR must distinguish: ordinary text deletion, deletion of indentation,
marker deletion, structural list dedent, deletion at content start,
deletion immediately before a marker, deletion after a marker — expressed
in terms of the 3-space unit and actual whitespace, never an abstract
"nesting-level" variable. Required explicit test widths: 1–9 spaces, plus
representative coverage beyond that.

### 1.7 Enter

Enter preserves the same indentation/nesting semantics; a sibling created
from a nested construct uses the same indentation the parent construct
already has (not a re-derived or different model):

```text
- Parent
···- Child|Text
```
Enter →
```text
- Parent
···- Child
···- Text
```

Required distinct caret-position dimensions for Enter: end of text, start
of text after marker, middle of text, immediately before a marker,
marker-only line, empty list item, after indentation but before marker,
task marker, bullet marker, ordered marker, nested constructs; plus
repeated Enter and the mixed sequences in §3.

### 1.8 Marker type is independent from indentation

Indentation determines nesting; the marker determines construct type.
`···- Child` and `···- [ ] Task` have equivalent indentation, different
construct types. Enter must preserve/create the marker type appropriate to
context, not blindly copy whatever marker is physically nearest the
caret — restates the right-hand-marker-lookahead correction already
frozen in `keyboard-odr-test-matrix.md`.

### 1.9 Mixed and irregular indentation (mandatory coverage)

1–9 leading spaces, representative list/task/ordered-list examples,
explicitly including `5 = 3 + 2` and `7 = 3 + 3 + 1`. Also: mixed
tabs/spaces, pasted indentation, manually typed indentation, and
indentation produced or modified by each of Enter/Tab/Backspace/Shift+Tab.

### 1.10 Parser behavior must be separated from editor behavior

Do not assume the 3-space contract can override the Markdown parser. Where
`@lezer/markdown` interprets a whitespace pattern as nested list, lazy
continuation, paragraph continuation, separate block, or
malformed/non-nested content, that is recorded as **parser/grammar
constraint**, distinct from **editor keystroke contract**. Do not "fix"
parser behavior during this documentation pass.

---

## 1.11 Contradiction Log — why this contract is PROPOSED, not adopted

Per the operator's own instruction ("if an existing rule conflicts with
this contract, flag the contradiction explicitly and resolve it rather
than leaving two competing definitions") and ("do not claim a behavior is
correct merely because it matches the current implementation"): the
3-space-unit contract, as stated, conflicts with three independently
verified `[A]` facts about the current implementation. None of these are
resolved by this document — they are flagged for an explicit operator
decision before §1 can be marked adopted.

| # | Contract says | Current implementation actually does (`[A]`, verified) | Where |
|---|---|---|---|
| C1 | One indentation unit = 3 spaces, uniformly | CM6's default `indentUnit` facet = **2 spaces**. This is what plain-paragraph Backspace, and most caret-before-marker list Backspace cases (which fall through to CM6's generic `deleteCharBackward`), actually snap to — confirmed empirically for widths 1,3,4,5 (bullet), 1,2,4,5,6 (ordered), 1,3,4,5 (task). | `backspace-indentation-investigation.md` §1.3; `deleteCharBackward` in `@codemirror/commands` uses `getIndentUnit(state)`, not a Clutter-set constant — Clutter never configures `indentUnit`, so the library default (2) applies everywhere. |
| C2 | One indentation unit = 3 spaces, uniformly, for Tab/Shift+Tab | Clutter's own `indentListItem`/`dedentListItem` (`listIndentKeymap.ts`) already nests to the **previous/grandparent sibling's actual `contentColumn`** — a value derived from that sibling's real marker width, not any fixed constant. Bullet `"- "` → 2. Ordered `"1. "` → 3 (grows with digit count, e.g. `"10. "` → 4). Task `"- [ ] "` → 6. | `listIndentKeymap.ts:73-84` (`contentColumn`), `:221-245` (`indentListItem`), `:280-298` (`dedentListItem`) |
| C3 | 3-space nesting works the same for every construct family | CommonMark/Lezer nesting recognition is driven by each item's own marker content-column width, not a fixed per-level increment. A uniform 3-space rule would misparse: 3 spaces correctly aligns a bullet child (content column 2, so 3 spaces already over-indents by 1) but under-indents a `"10. "` ordered child (needs 4) and drastically under-indents a task child (needs 6). | `backspace-indentation-investigation.md` §1.3.1 (parser lazy-continuation threshold tied to parent content column, not a fixed width); `getContext`/marker regexes in `@codemirror/lang-markdown` |

**Consequence:** adopting §1 literally, without resolving C1–C3, would mean
Tab/Shift+Tab/Backspace stop matching how the parser actually nests
content for ordered lists and tasks — a self-inflicted parser/editor
mismatch of exactly the kind §1.10 warns against. This is not decided
here. Candidate resolutions (not chosen, listed only so the decision isn't
made blind): (a) redefine the canonical unit as "the owning construct's
own marker content-column width" rather than a fixed 3 — which is closer
to what Tab/Shift+Tab already do, or (b) keep a fixed numeric unit but
make it construct-aware (different unit per marker family), or (c) accept
a deliberate, explicitly-documented divergence between "keystroke unit"
and "parser nesting width" with a defined reconciliation rule for the gap
between them. Do not implement any of these. Flag and stop.

---

## 2. Retrofit — existing keystroke ODR entries reconciled against §1

Format per the operator's requirement: **Expected (contract) → Current
(observed) → Tested? → Confirmed? → Bug? → Implementation status.** Rows
are representative, not exhaustive — full per-width/per-construct
population is the next authoring pass, gated on resolving §1.11.

### 2.1 Enter

| Rule (from `keyboard-odr-test-matrix.md`) | Expected per §1 | Current (observed) | Tested? | Confirmed? | Bug? | Impl. status |
|---|---|---|---|---|---|---|
| ENTER-E1 (end-of-content → same-level sibling) | Sibling indentation = parent's own indentation exactly, whatever unit produced it (§1.3, §1.7) | Not yet directly measured against a 3-space-unit document; prior work used 2-space bullet indentation only | No — frozen invariant only, no test suite written yet | Not yet | Unknown | Not implemented; ODR-only |
| ENTER-E2 (split-at-caret → same-level sibling) | Same as above, split content moves with correct indentation | Not yet measured | No | Not yet | Unknown | Not implemented; ODR-only |
| ENTER-E3 (empty-item → progressive dedent) | Each Enter removes exactly one indentation unit per §1.1/§1.2, using whichever unit C1–C3 resolves to | Not yet measured against the 3-space contract; original E3 examples used 2-space-per-level bullet documents, so "one level" there already meant one *marker-width* unit (2), not necessarily 3 | No | Not yet | **Potential contradiction** — E3's "depth decreases by exactly 1" must be re-expressed in §1's terms once C1–C3 is resolved, since "1 level" and "1 canonical unit" are not proven equal | Not implemented; ODR-only |
| Right-hand-marker lookahead (Enter before a following marker) | Unaffected by indentation contract — this is a construct-type rule (§1.8), orthogonal to unit width | No conflict identified | No | Not yet | No | Not implemented; ODR-only |
| Indentation+Backspace→marker-boundary→Enter mixed sequence | Each Backspace step removes indentation per whichever unit C1–C3 resolves to; construct-preserving Enter per §1.8 unaffected | The example in `keyboard-odr-test-matrix.md` was written before this contract existed and does not state its assumed unit width — needs re-authoring once C1–C3 resolves | No | Not yet | **Needs re-authoring**, not a bug — the sequence logic is sound, only the concrete widths used in the worked example are now ambiguous | Not implemented; ODR-only |

### 2.2 Backspace

| Rule | Expected per §1 | Current (observed, `[A]`) | Tested? | Confirmed? | Bug? | Impl. status |
|---|---|---|---|---|---|---|
| Marker/content-separator boundary transition (`ListMark` → literal text) | Unaffected by indentation-unit width — this is a marker/content boundary rule, not a nesting-width rule | Not yet re-verified against this contract; prior finding stands as its own frozen entry | Partially — captured as a state-sequence requirement, not yet executed | Not yet | No | Not implemented; ODR-only |
| Caret-before-marker, in leading whitespace | Per §1.6: distinguish ordinary/indentation/marker/structural-dedent cases explicitly, expressed in 3-space terms | **Contradicts §1 directly (C1, C2).** Observed: mod-2 tab-stop snapping (CM6 default) for most widths, with `deleteMarkupBackward` (upstream) claiming some widths inconsistently, and Clutter's own structural dedent (`deleteMarkupBackwardSubtreeAware`) **never** claiming this caret position at all — confirmed for every tested width 1–6, all three marker families | Yes — `[A]`, live-executed | Yes | **Yes — this is the central contradiction**, not a hypothetical one; current behavior is unit-2-based and command-arbitration-based, not unit-3-based or structural | Current implementation does not implement §1 at this caret position; not fixed here |
| Caret at content-start | Per §1: marker-preserving structural dedent removing exactly one canonical unit | Marker-preserving structural dedent confirmed **[A]**, but the unit it removes is the sibling/grandparent's own `contentColumn` (C2) — construct-width-based, not a fixed 3 | Yes — existing production test suite (`listDeleteKeymap.test.ts`) | Yes | **Partial mismatch** — the *mechanism* (structural, marker-preserving) matches the spirit of §1.6; the *unit width* does not match §1.1's literal "3 spaces" | Implemented (production), but implements C2's model, not §1's model, literally |
| Caret inside a marker's own characters (e.g. between digit and `.`) | Not addressed by §1 at all — §1 discusses indentation, not intra-marker positions | **[A]** confirmed: falls through to CM6's raw single-character deletion, can corrupt the marker into invalid syntax (e.g. `1.` → `.`) | Yes — `[A]`, live-executed | Yes | **Yes, a real gap** — undefended, corruption-producing, and outside §1's stated scope entirely; needs its own contract entry, not an assumption that §1 covers it | Not implemented; not decided |
| Widths 1–9 spaces, all three marker families | Required explicit test coverage per §1.6/§1.9 | Full 1–6 matrix already captured `[A]` for bullet/ordered/task in `backspace-indentation-investigation.md`; 7–9 not yet run | Partial | Partial | See Contradiction Log | Not implemented; extend investigation to 7–9 before treating §1.9 coverage as complete |
| Tab / mixed tab+space indentation | Per §1.3, source-agnostic — a tab-produced and space-produced identical column should behave identically | **[A]** confirmed NOT source-agnostic in current behavior: a trailing tab is deleted atomically as one character regardless of visual width, while equivalent-width space runs snap by column — directly contradicts §1.3 as currently implemented | Yes — `[A]` | Yes | **Yes** — current implementation is source-aware (distinguishes tab from spaces), contract demands source-agnostic | Current implementation contradicts §1.3; not fixed here |

### 2.3 Tab

| Rule | Expected per §1.4 | Current (observed) | Tested? | Confirmed? | Bug? | Impl. status |
|---|---|---|---|---|---|---|
| Tab adds one indentation unit, list context | Adds exactly 3 spaces, no hidden state | **[A]** (from prior production reading, not re-verified this pass): adds exactly enough spaces to reach the previous sibling's `contentColumn` — varies by marker family (2/3+/6), not a fixed 3 | Yes — existing production test suite (`listIndentKeymap.test.ts`) | Yes, against its own (non-3-space) model | **Direct contradiction of §1.1/§1.4** — same root cause as C2 | Implemented (production); implements per-marker-width nesting, not the literal 3-space contract |
| Tab, plain-paragraph context | Adds one `indentUnit` (CM6 default = 2) via `indentMore` | Confirmed via code reading (`paragraphIndentKeymap.ts`) that this is CM6's own generic `indentMore`, which uses the `indentUnit` facet — 2, not 3, since Clutter never sets it | Not re-verified `[A]` this pass | Not yet | **Direct contradiction of §1.1** — same root cause as C1 | Implemented (production); implements the 2-space CM6 default, not the 3-space contract |
| Tab where no valid target exists (no preceding sibling) | Not addressed explicitly by §1.4 | Command still consumes the keystroke and returns `true` with no document change, per existing doc comments | Yes — existing production test suite | Yes | No — matches existing documented always-consumed contract, orthogonal to unit width | Implemented (production) |

### 2.4 Shift+Tab

| Rule | Expected per §1.5 | Current (observed) | Tested? | Confirmed? | Bug? | Impl. status |
|---|---|---|---|---|---|---|
| Removes one complete indentation unit | Removes exactly 3 spaces when one full unit exists | Removes exactly the delta down to the grandparent's `contentColumn` — construct-width-based, same root cause as C2 | Yes — existing production test suite | Yes, against its own model | **Direct contradiction of §1.1/§1.5** | Implemented (production); does not implement the literal 3-space contract |
| Behavior on a remainder structure (e.g. `5 = 3 + 2`) | **Explicitly undefined by §1.5 itself** — the contract's own author flags this as needing a decision, not an assumption | Not yet measured against a document actually containing a non-marker-aligned remainder in this framing | No | Not yet | Not yet classifiable — this is an open question, not a confirmed bug | Not implemented; not decided |

### 2.5 Delete (forward)

| Rule | Expected per §1 | Current (observed) | Tested? | Confirmed? | Bug? | Impl. status |
|---|---|---|---|---|---|---|
| Delete where indentation/nesting is involved | Same 3-space model as Backspace, mirrored forward (§1.1) | **Not yet investigated at all** for this session's evidence base. `legacy-editor-keyboard-behavior-recovery.md` §8 records forward Delete as unimplemented/unverified in the *old* editor; the *current* CodeMirror editor's forward-Delete behavior has not been read or executed this pass | No | No | Unknown | **Out of scope for this retrofit — flagged, not fabricated.** Needs its own investigation pass before any row here can be filled in honestly |

### 2.6 Arrow keys (Left/Right/Up/Down)

| Rule | Expected per §1 | Current (observed) | Tested? | Confirmed? | Bug? | Impl. status |
|---|---|---|---|---|---|---|
| Arrow navigation across indentation/marker boundaries | Whatever caret-position taxonomy §1 implies (before/inside/after indentation, before/inside/after marker) should apply consistently to where arrow keys land | **Not yet investigated** this pass. `legacy-editor-keyboard-behavior-recovery.md` §1.3/§8 records the *old* editor's `handleArrowNavigation` existed but several sub-cases were never fully characterized there either; the *current* CodeMirror editor's arrow-key behavior around lists/markers has not been read or executed this session | No | No | Unknown | **Out of scope for this retrofit — flagged, not fabricated.** Needs its own investigation pass |

---

## 3. Interaction-sequence requirement (preserved, not weakened)

The editor is a state machine: `initial document → key → resulting
document/caret → next key → resulting document/caret → …`. Every sequence
below must be tested as a chain, each result feeding the next operation as
input — not as isolated single-keystroke cases:

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
```

— and the same sequences repeated across mixed construct types (bullet →
task, task → ordered, ordered → bullet, and nested combinations of each),
per the existing requirement in `keyboard-odr-test-matrix.md`. This
requirement is unchanged by the indentation-contract retrofit; it is
restated here so the consolidated document is self-contained.

---

## 4. Caret-position taxonomy (preserved, restated for completeness)

The same key on the same document can have legitimately different
expected behavior depending on where the caret sits. This taxonomy is
carried forward unchanged from the existing frozen work and applies across
every keystroke in §2:

- Before indentation
- Inside indentation
- After indentation
- Before marker
- Inside marker
- After marker
- After marker separator (the space between marker and content)
- At text start
- In the middle of text
- At text end
- On an empty marker-only line
- At a block boundary
- With a (non-empty) selection

No row in §2 that collapses two of these into one case should be treated
as complete — see the "Tested?"/"Confirmed?" columns, most of which are
still `No`/`Not yet` precisely because this full cross-product has not
been executed yet.

---

## 5. What this document does not do

- It does not implement any fix, in any of the "Bug? = Yes" rows above.
- It does not resolve the §1.11 contradiction — that is an explicit,
  named decision for the operator, not something inferred here.
- It does not fabricate Delete or Arrow-key findings that were not
  actually investigated this session (§2.5, §2.6).
- It does not remove or soften any previously discovered edge case
  (marker corruption on intra-marker Backspace, the parser
  lazy-continuation threshold, nested-ordered-list renumbering gap, the
  tab-source-awareness contradiction) merely because they complicate the
  picture.

Implementation stays frozen until §1.11 is resolved and the remaining
`Tested? = No` rows in §2 are filled in with real, executed evidence.
