# Inline Live Preview Region ODR v1 — Structural Visibility Resolution for Nested Markdown Constructs

**Status: Accepted — architecture locked, implementation not yet performed.**
No production code, tests, or helpers are created or modified by this
document. The migration plan in §10 is the authorized path from the
current architecture to the locked one; nothing in §10 is implemented yet.

**Scope:** inline Live Preview visibility for Markdown constructs that
conceal or replace their own source text. Block-level rendering is
explicitly excluded (§4.10).

**Supersedes, in part:** the "Live-preview rendering architecture
(research, 2026-08-23) — Recommended, not locked" section of
[`docs/editor-architecture-decisions.md`](../editor-architecture-decisions.md),
insofar as that section left the ownership boundary for nested-construct
visibility undecided. Its per-construct decoration-type recommendations
(`mark` for content, `replace` for markers) are unaffected and remain
current.

---

## 1. Context — the defect that forced this decision

Manual verification in the real Tauri/WKWebView app, after the
Strikethrough Live Preview slice shipped (`aee068d0`), produced a
reproducible contract violation:

```
~~__Text__~~
```

With the caret immediately inside the outer `~~` delimiters but outside
the inner `__` delimiters, the outer Strikethrough revealed its own
markers while the inner StrongEmphasis stayed concealed — a visually
incoherent half-preview/half-source state that no Live Preview editor
should be able to enter.

The naive reading is "a Strikethrough bug." That reading is wrong, and
acting on it would have been the third consecutive local fix to a
structural problem. The correct diagnosis:

- `emphasisLivePreview` runs its own syntax-tree traversal and asks
  `isTokenEngaged` about `Emphasis`/`StrongEmphasis` ranges only.
- `strikethroughLivePreview` runs a **separate** traversal and asks
  `isTokenEngaged` about `Strikethrough` ranges only.
- Neither can observe the other's nodes, so neither can know it is
  participating in a single nested formatting region.

`emphasisLivePreview`'s traversal short-circuit (`return false` when an
outer node is engaged, so nested nodes are never independently evaluated)
was and remains structurally correct. What was wrong was its **scope**:
the short-circuit protected exactly the node kinds that happened to share
one file. For as long as `Emphasis`/`StrongEmphasis` were the only
mutually-nesting participants with a live plugin, "one file" and "the set
of nodes that can nest with each other" were accidentally the same set.
Adding a second, independently-traversing plugin for a kind the grammar
lets nest with the first broke the coincidence and exposed the real rule:

> **The scope of a visibility decision is a grammar fact (which node kinds
> can be ancestor/descendant of one another), never an implementation fact
> (how many files or plugins the code is split across).**

This is not a Strikethrough problem, and fixing it pairwise would be
combinatorial. The same defect is already latent — verified structurally
below — in `**[[WikiLink]]**`, `**`code`**`, `==**bold**==`,
`~~==highlight==~~`, and every future construct that can nest inside or
contain another.

---

## 2. Evidence base

All node shapes below were produced by parsing against this repository's
own `markdownLanguageExtension()` (the exact grammar the editor runs),
not inferred from CommonMark/GFM documentation. Representative confirmed
trees:

| Source | Resulting tree (abbreviated) |
|---|---|
| `**[[Page]]**` | `StrongEmphasis > [EmphasisMark, WikiLink, EmphasisMark]` |
| `[[**Page**]]` | `WikiLink` — flat leaf; `**Page**` stays literal inside it |
| `` `**bold**` `` | `InlineCode > [CodeMark, CodeMark]` — content never re-parsed |
| ``**`code`**`` | `StrongEmphasis > [EmphasisMark, InlineCode, EmphasisMark]` |
| `==**bold**==` | `Highlight > [HighlightMark, StrongEmphasis, HighlightMark]` |
| `**==highlight==**` | `StrongEmphasis > [EmphasisMark, Highlight, EmphasisMark]` |
| `~~==highlight==~~` | `Strikethrough > [StrikethroughMark, Highlight, StrikethroughMark]` |
| ``***~~`code`~~***`` | `Emphasis > StrongEmphasis > Strikethrough > InlineCode` (4 levels) |

**Structural invariant confirmed across every case:** a nested
participant's range is always a strict subset of its enclosing
participant's range, with zero character gap between the outer node's own
marks and the inner node's range. This containment property is what makes
a purely structural solution possible, and it is the load-bearing fact
under §5.

---

## 3. Terminology

Defined once here; used normatively throughout.

- **Visibility-participating construct** — a Markdown construct whose
  at-rest Live Preview form conceals or replaces its own source text
  (hidden markers, or whole-node widget replacement). Participation is a
  property of the construct, declared in one place (§4.11), not inferred
  per call site.
- **Inline rendering region** — for any position, the subtree rooted at
  the **outermost** visibility-participating ancestor. A region is a
  structural fact derived from the syntax tree per render pass; it is
  never a stored object, a node type, or a persisted concept.
- **Region root** — the outermost visibility-participating node of a
  region.
- **Direct engagement** — the existing, unchanged
  `isTokenEngaged(state, {from, to})` predicate: the selection (including
  a zero-width caret) lies within a single node's own range, both
  boundaries inclusive.
- **Effective visibility** — whether a node currently renders as preview
  or as source. Formally: a node renders as **source** if and only if some
  visibility-participating **ancestor-or-self** is directly engaged.
  Effective visibility is the quantity this ODR governs; direct engagement
  is one input to it, not a synonym for it.

---

## 4. The Decision

Each rule below is normative and binding. Changing one requires a new ODR
that supersedes this one, not a PR that drifts from it.

### 4.1 Visibility is resolved at the inline rendering-region level, not per construct

Effective visibility is a property of the **region**, not of the
individual node. A single construct's own range is never sufficient input
to decide whether that construct renders as preview or source, because a
directly-engaged ancestor overrides it.

*Why:* §1's defect is definitionally unfixable at per-construct
granularity — no node's local containment check can encode "was an
ancestor I cannot see also engaged?"

### 4.2 The Markdown syntax tree is authoritative for containment and nesting

All nesting relationships are read from `syntaxTree(state)` at render
time. No parallel model of what-contains-what is built, cached, stored on
nodes, or hand-maintained anywhere.

*Why:* the grammar already computes containment correctly and
incrementally; any second model is a drift risk with no compensating
benefit. Consistent with the already-Locked "no second parser" and "no
data beyond node type and range on the tree" principles.

### 4.3 `isTokenEngaged` remains the primitive for direct engagement, unchanged

`semanticToken/tokenEngagement.ts`'s `isTokenEngaged` stays the single
implementation of direct engagement. It is not modified, wrapped in a
competing predicate, reimplemented, or replaced. Its inclusive-boundary
semantics (caret exactly at `node.from`/`node.to` counts as engaged) are
part of the locked contract, for the already-established reason: that
boundary is precisely where the caret sits immediately after typing a
closing delimiter, and a narrower rule conceals a construct on the very
keystroke that completes it.

*Why:* the primitive was never the defect. Region resolution is built
**on top of** it, by controlling which nodes it is asked about and in what
order — not by changing what it means.

### 4.4 A visibility-participating nested region has one coherent preview/source state

A region is either entirely preview or entirely source. Mixed states —
outer revealed with inner concealed, or the inverse — are contract
violations, not edge cases.

*Consequence, recorded explicitly because it is a real and possibly
surprising behavioral implication:* sibling constructs inside a
directly-engaged ancestor also render as source. With the caret inside
`**a**` in `~~**a** and **b**~~`, the caret lies within the enclosing
`Strikethrough`'s range, so the entire Strikethrough region — including
`**b**` — renders as source. This follows necessarily from §4.1 and is
accepted as correct: the region, not the word, is the unit.

### 4.5 Construct-specific renderers own decoration and visual representation, not engagement policy

A construct's implementation supplies only: which of its own sub-ranges
are markers to conceal, what class or widget represents it, and any
construct-specific rendering facts. It never computes, consults, or
overrides engagement.

*Current state supports this without rework:* every existing renderer
(`getEmphasisMarkRanges`, `getStrikethroughMarkRanges`,
`getInlineCodeMarkRanges`, `getHighlightMarkRanges`, `renderWikiLink`) is
already a pure `(node) → decoration facts` function containing zero
engagement logic. This rule ratifies the existing separation rather than
imposing a new one.

### 4.6 Plugin and module boundaries never define behavioral nesting boundaries

How many `ViewPlugin`s, files, or modules the implementation uses is an
implementation detail. It must never be observable in nesting behavior. A
future refactor that splits or merges plugins must not change any
visibility outcome.

*Why:* this is the precise, generalized statement of §1's root cause.

### 4.7 No pairwise or combination-specific logic is permitted

No code may name a combination of constructs. Forbidden shapes include
"if Strikethrough contains Emphasis," "emphasis + WikiLink," ordered
precedence tables between construct kinds, or any conditional whose
predicate mentions two construct kinds together.

*Why:* combination logic is O(n²) in constructs, unmaintainable, and
guarantees that every new construct reopens every existing construct.

### 4.8 Adding a visibility-participating construct must not require modifying existing construct implementations

Introducing a new participant requires exactly two additions: declaring
its participation, and registering its own renderer. No existing
construct's implementation, tests, or behavior may need to change to
accommodate combinations with it.

*This is the primary acceptance test for the architecture.* If a proposed
implementation cannot satisfy §4.8, it does not satisfy this ODR.

### 4.9 Rendering mechanism does not constitute a structural rendering boundary

Marker-concealing decorations (`Decoration.replace` on marker sub-ranges
plus `Decoration.mark` on content), whole-node widget replacement, and
`atomicRanges` registration are **rendering** differences. They do not
create separate visibility domains. A widget-rendered construct and a
marker-concealed construct nested in one another belong to one region and
share one visibility answer.

*Consequence:* the semantic-token family (`WikiLink`, `Tag`, `Date`,
`Task`) participates in the same authoritative structural mechanism as
the marker-hiding family, despite rendering completely differently and
additionally driving `EditorView.atomicRanges`. `**[[Page]]**` is
structurally the identical defect to `~~__Text__~~` and must not be
solved by a second mechanism. Sequencing of this integration is a
migration concern (§10), not a contract concern.

### 4.10 Block-level rendering remains outside this mechanism

Heading markers, list markers, blockquote markers, horizontal rules, and
tables are **not** governed by this ODR. Their engagement is
line-scoped, not subtree-scoped (`liveMarkDecoration.ts`'s
`'physical-line'` mode, currently used by `headingMarkerDecoration` and
`blockquoteMarkerDecoration`), and their at-rest form conceals only a
line-anchored prefix rather than an enclosing span — so a nested inline
construct inside a heading has nothing to inherit from the heading.

Expanding this mechanism to block-level constructs requires an explicit
future architectural decision. Until then, block-level marker mechanisms
retain their existing owner and are not consolidated away.

### 4.11 One authoritative structural mechanism; no duplicate traversal, predicate, or visibility state

There is exactly one place that resolves nested Live Preview visibility:
one traversal, one participant declaration, one engagement call path. No
second traversal, no parallel engagement predicate, no cached or stored
visibility state anywhere.

*Current violation to be resolved by §10:* engagement is presently
decided independently at **eight-plus** call sites —
`emphasisLivePreview`, `strikethroughLivePreview`, `liveMarkDecoration`
(six construct call sites), `liveMarkSelectionSnap`,
`semanticTokenDecorations` (three kinds), `wikiLinkMarkerDecorations`, and
the per-kind `wikiLinkEngagement`/`tagEngagement`/`dateEngagement`
wrappers used by mouse handlers.

*Note:* the per-kind engagement wrappers used by **interaction** code
(mouse handlers deciding whether a click activates a token) are answering
a different question — "is this specific token directly engaged" — and are
not visibility resolution. They remain valid uses of `isTokenEngaged` and
are out of scope for consolidation, provided they never make **rendering**
visibility decisions.

### 4.12 Tests prove structural invariants, not construct combinations

The test suite must demonstrate the general rule through structurally
distinct representatives, not enumerate pairs. Adding a construct must not
add a combinatorial block of tests. See §9.

---

## 5. Normative resolution algorithm

The mechanism satisfying §4 is outer-first traversal with
engagement short-circuit — the pattern already validated in
`emphasisLivePreview.ts`, applied at the correct scope.

```text
for each visible range:
  syntaxTree(state).iterate({
    enter(node):
      if node is NOT a visibility participant:
          return                  # keep descending; non-participants are transparent
      if isTokenEngaged(state, node.range):
          return false            # REGION ROOT ENGAGED — do not descend.
                                  # Nothing inside emits decorations, so the
                                  # whole region renders as source.
      emit decorations from this node's registered renderer
      return                      # keep descending; nested participants
                                  # evaluate their own ranges
  })

decorations = Decoration.set(ranges, true)   # unchanged; tolerates nested/overlapping order
```

### 5.1 Why this is correct, structurally

Two cases, exhaustive:

1. **An ancestor participant is directly engaged.** Traversal reaches it
   first (outer-before-inner is guaranteed by tree iteration order),
   returns `false`, and never descends. No descendant is visited, so no
   descendant can emit a conflicting decoration. The entire region renders
   as source. **§4.4 satisfied.**

2. **No ancestor participant is directly engaged.** By the containment
   invariant (§2), every descendant's range is a strict subset of each
   ancestor's range. If the selection is not within the ancestor's range,
   it cannot be within the subset. Therefore every descendant's own
   `isTokenEngaged` independently and correctly returns false, and each
   emits its own concealing decorations. The entire region renders as
   preview. **§4.4 satisfied.**

The algorithm computes "some ancestor-or-self is directly engaged"
(§3, effective visibility) in a single downward pass, **without ever
walking up the tree** and **without any node knowing what kind its
ancestors are**. It contains no construct names, no pairs, and no
ordering between kinds — satisfying §4.7 and §4.8 by construction.

### 5.2 Participation declaration

Participation is a flat set of node names plus a per-name renderer
registration. Adding a construct is one entry in each — never a change to
another construct.

The **shape** of that registry (a `Map`, a facet, an extension-supplied
list) is deliberately left to implementation, subject only to §4.8 and
§4.11. This ODR locks the ownership model, not a data structure.

---

## 6. Engagement semantics — normative behavior table

For `Region root → Child → Grandchild`, all visibility participants:

| Caret position | Region root | Child | Grandchild | Region state |
|---|---|---|---|---|
| Outside root's range | preview | preview | preview | preview |
| At `root.from` (inclusive) | source | source | source | **source** |
| Inside root, outside child | source | source | source | **source** |
| At `child.from` | source | source | source | **source** |
| Inside child, outside grandchild | source | source | source | **source** |
| Inside grandchild's content | source | source | source | **source** |
| At `child.to` | source | source | source | **source** |
| At `root.to` (inclusive) | source | source | source | **source** |
| One position beyond either root edge | preview | preview | preview | preview |

Every "source" row is produced by the same single mechanism (§5, case 1)
and requires no knowledge of which construct kinds occupy which level.
The table is explanatory; it is not a list of cases to implement
separately.

---

## 7. Explicitly out of scope

Recorded so they are not silently conflated with this decision or
"fixed" as a side effect of implementing it.

1. **The whole-document initial-caret limitation** — a construct whose
   range is the entire document loads revealed, because
   `createEditorView.ts` seeds the caret at `doc.length`, which is an
   inclusive boundary. Known, deliberately deferred, unrelated to nesting.
   Must remain pinned as a documented limitation, not solved here.
2. **The `liveMarkSelectionSnap` / `transactionFilter` question** — whether
   that click-boundary correction is safe to (re)introduce remains open and
   is decided separately. This ODR neither adopts nor forbids it.
3. **Block-level constructs** — per §4.10.
4. **Cursor/selection movement behavior** — the superseding decision that
   CodeMirror owns cursor and selection behavior (no Clutter Arrow-key
   interception) is untouched. Whether re-enabled at-rest widgets
   eventually need selection assistance remains its own open question for
   the semantic-token family.
5. **Which constructs get re-enabled, and in what order** — this ODR
   governs how visibility resolves for whatever is enabled; it does not
   schedule feature re-enablement.

---

## 8. Implementation artifacts explicitly recorded as non-contractual

The current split between `emphasisLivePreview.ts` (Emphasis +
StrongEmphasis) and `strikethroughLivePreview.ts` (Strikethrough) is an
**artifact of implementation history** — two vertical slices delivered in
sequence — and **does not represent a behavioral boundary**. It is the
direct proximate cause of §1's defect.

Recorded consequences:

- The Emphasis/Strikethrough separation carries **no architectural
  authority** and must not be cited as precedent for future construct
  boundaries.
- `strikethroughLivePreview.ts` (`aee068d0`), including its doc comment's
  reasoning that Strikethrough needs no traversal coordination because it
  cannot self-nest, is **superseded**. That reasoning was correct about
  same-kind nesting and wrong about cross-kind nesting, which is the case
  that matters.
- Both implementations are **subject to consolidation and rework** under
  §10, not preserved for continuity.
- The strikethrough investigation's "Option 1: separate plugin"
  recommendation and its supporting §C analysis are **superseded** by this
  ODR. That investigation's *parser findings* remain valid evidence and are
  reused in §2 above; its *architectural conclusion* is withdrawn.

---

## 9. Test strategy — invariants, not combinations

Tests must prove the structural rule. A passing nested case is evidence of
the general mechanism, not a claim about that specific pair.

**Required invariant tests:**

1. **Region atomicity across structurally distinct participant classes.**
   Choose representatives *because they are structurally different*, not to
   cover pairs: one same-family case (`Strikethrough > StrongEmphasis`),
   one terminal-mark case (`Strikethrough > InlineCode` — can be child,
   never parent), one terminal-widget case (`StrongEmphasis > WikiLink` —
   different rendering mechanism, per §4.9), and the verified 4-level chain
   (``***~~`code`~~***``). For each: assert that **every** caret position
   within the region root's range (both inclusive boundaries, between each
   mark level, inside innermost content) renders the fully raw source.
2. **Disengagement independence.** For positions outside the region root,
   assert every level independently conceals — pinning §5 case 2 so it
   cannot regress into pairwise logic later.
3. **Region coherence.** Assert no caret position produces a mixed
   preview/source region (§4.4), including the sibling consequence
   (`~~**a** and **b**~~` with the caret in `**a**`).
4. **Cross-region independence.** An unrelated instance of the same
   construct elsewhere in the document resolves independently.
5. **Extensibility proof (§4.8 acceptance test).** When a construct joins
   the participant set, exactly one new test — nesting it inside one
   existing participant — is added, and **no existing construct's test file
   is modified**. A change that requires editing other constructs' tests
   fails this ODR.
6. **No stored visibility state.** Visibility is recomputed per pass from
   selection and tree only.
7. **Known limitation stays pinned separately** (§7.1), never entangled
   with the atomicity invariants.

**Explicitly not required:** a matrix of every construct pair.

---

## 10. Migration plan

Phased so that the verified user-visible defect is fixed first, by the
smallest change that is already the locked architecture rather than a
stepping stone to it. Each phase is independently verifiable and
committable per the repository's commit workflow.

### Phase 0 — this ODR (complete on acceptance)
No code. Establishes §4 as binding.

### Phase 1 — Establish the authoritative mechanism; consolidate the live inline constructs
**Scope:** create the single authoritative region-resolution mechanism
(§5) with a participant registry (§5.2). Migrate the three currently-wired
participants — `Emphasis`, `StrongEmphasis`, `Strikethrough` — onto it,
reusing their existing, unmodified renderer functions. Retire
`emphasisLivePreview.ts` and `strikethroughLivePreview.ts` and their test
files, migrating their behavioral coverage (not discarding it) into the
new invariant-shaped suite (§9). Wire the single plugin into
`MarkdownEditor.tsx` in place of the two.

**Exit criteria:** `~~__Text__~~` and `***~~Text~~***` reveal atomically
from every caret position within the region root (§6); all migrated
behavior from both retired suites still passes; manual verification in the
real app confirms the screenshotted defect is gone.

**Explicitly not in Phase 1:** no new constructs enabled, no dormant
mechanism deleted, no `transactionFilter` introduced or removed.

### Phase 2 — Fold in the remaining dormant marker-hiding participants
**Scope:** as `Highlight` and `InlineCode` are re-enabled, they join via
registry entries only (§4.8). Their existing `liveMarkDecoration`-based
modules (`highlightMarkerDecoration`, `inlineCodeMarkerDecoration`) become
redundant for inline visibility and are retired at that point — not
before.

**Exit criteria:** each addition touches exactly the new construct's own
files plus one registry entry, and adds exactly one nesting test (§9.5).

### Phase 3 — Integrate the semantic-token (widget) family
**Scope:** bring `WikiLink`, `Tag`, `Date`, and `Task` under the same
authoritative mechanism (§4.9) when their decorations are re-enabled.

**Known sub-problem to resolve within this phase, flagged now rather than
discovered later:** `semanticTokenDecorations` currently derives
`EditorView.atomicRanges` from its own complete decoration set. Under
consolidation the atomic set must be derived from **only** the
widget-family subset of the region's decorations — ordinary concealed
formatting markers must never become atomic, per the already-Locked
distinction. This is a real design question with a known constraint, not a
blocker, and it does not affect Phases 1–2.

### Phase 4 — Retire duplicated visibility mechanisms
**Scope:** with inline visibility consolidated, `liveMarkDecoration.ts`'s
`'node-range'` mode has no remaining inline consumer. It is **not** simply
deleted: `'physical-line'` mode still legitimately serves
`headingMarkerDecoration` and `blockquoteMarkerDecoration`, which §4.10
places out of scope. This phase narrows the module to its block-level
responsibility, or extracts that responsibility, as an explicit decision —
and settles the `liveMarkSelectionSnap` question (§7.2) rather than
inheriting it silently.

**Ordering note:** Phase 4 must not be attempted before Phase 3, since the
semantic-token family's integration may change what the block-level
mechanism needs to keep.

---

## 11. Consequences

**Easier:**
- New inline constructs integrate by declaration, not by modifying
  existing constructs (§4.8).
- Nesting behavior becomes explainable from tree structure alone; no
  construct-combination knowledge is required to reason about it.
- One place to look, and one place to fix, when visibility is wrong.

**Harder / accepted costs:**
- One traversal must know the participant set, which is a small piece of
  shared knowledge — deliberately preferred over N traversals each with
  partial knowledge.
- The sibling-reveal consequence (§4.4) is a genuine behavioral commitment
  that may occasionally surprise; accepted as the necessary price of region
  coherence.
- Phase 3 must solve the `atomicRanges` scoping question that the current
  independent-plugin arrangement avoids by accident.

**Neutral:**
- `isTokenEngaged`, `Decoration.set(ranges, true)`, and the traversal
  short-circuit pattern are all reused unchanged. This is a consolidation
  of *where decisions are made*, not a redesign of *how rendering works*.

---

## 12. Alternatives considered and rejected

- **Coordinate the two existing plugins.** Rejected: preserves the
  plugin-boundary-as-behavior-boundary error (§4.6) and requires
  cross-plugin knowledge that grows with each construct.
- **Upward ancestor-walking in every construct's own plugin.** Rejected:
  N duplicate traversals and N engagement decision points, violating §4.11;
  also re-derives the same answer repeatedly per render.
- **A precedence/priority table between construct kinds.** Rejected:
  combination-specific by definition (§4.7), and the tree already encodes
  the only ordering that matters.
- **One plugin for literally everything, block-level included.** Rejected
  as premature: block-level engagement is genuinely line-scoped rather than
  subtree-scoped (§4.10), so merging them would force one mechanism to
  carry two different engagement models with no demonstrated benefit.
- **Leave it per-construct and document the mixed-state behavior as
  intended.** Rejected: directly contradicts the manually-verified product
  contract and produces visibly incoherent output.
