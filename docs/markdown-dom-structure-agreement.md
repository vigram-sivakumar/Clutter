# Markdown DOM Structure Agreement

Status: **Agreement revised (2026-08-27, third pass) — scope extended to cover independently-styleable inline Markdown markers (bold/italic/strikethrough/highlight/inline code/links/autolinks/WikiLink), per an explicit new product requirement. Lists remain explicitly out of scope for this pass — unchanged from the second pass, not silently expanded. No implementation changed.**

This document has seven parts:

1. Core invariants — the small number of rules every construct adopting this model must follow.
2. The explicit distinction between two legitimate rendering models (marker conceal/reveal vs. semantic UI replacement) — the contract does not mandate one primitive for everything.
3. The `cm-` class-naming contract, including the universal `cm-marker` hook.
4. Scope — what this agreement governs and what it explicitly does not, including the third-pass amendment extending it to inline formatting markers.
5. An audit of existing constructs against 1–3, from direct source inspection.
6. The Phase 2 migration plan (structural constructs: heading, list) — proposed, not started, not approved.
7. The Phase 2.5 migration plan (inline marker family) — proposed, not started, not approved, and explicitly excludes lists.

---

## 1. Core invariants

### 1.1 Source fidelity

Rendering/decorations must never mutate, normalize, duplicate, collapse, or delete Markdown source text. The syntax tree and document are authoritative at all times; a decoration only ever computes *how* to display what's already there.

### 1.2 Marker/content ownership

A marker must never be wrapped together with its content in the same semantic DOM element.

Valid:

```html
<span class="cm-quote-marker">&gt; </span>
<span class="cm-quote">Text</span>
```

Also valid — the content does **not** need its own span merely for symmetry with the marker:

```html
<span class="cm-heading-marker"># </span>Heading
```

Both shapes satisfy the invariant. What's never valid is one element whose content mixes marker characters and construct content:

```html
<span class="cm-heading">opening only</span>
```

### 1.3 Marker token

A marker span owns only the construct's marker token: its syntax characters, plus any separator whitespace intentionally treated as part of the marker's presentation. Examples: `"> "`, `"# "`, `"- "`, `"1. "`. It must never include actual content characters.

### 1.4 `.cm-line` geometry — hard invariant

`.cm-line` must never use `padding`, `margin`, or `text-indent` to manufacture marker or gutter geometry. Marker geometry must come from the marker/content DOM itself, or another construct-specific mechanism that does not alter `.cm-line`'s own geometry.

### 1.5 Real source-backed markers, when geometry requires it

When a construct needs source-backed geometry for correct caret, selection, or layout behavior — blockquote's own reason for existing, see the audit — keep the real Markdown characters in the DOM and style them with `Decoration.mark`, rather than removing them. This is a tool the contract makes available, not a mandate to apply everywhere: see 1.7.

### 1.6 Intentional replacement is allowed

`Decoration.replace`/widgets are not universally forbidden. They're correct when replacement is intentionally part of the product's representation — a semantic task checkbox is the current example. A task checkbox widget is **not** equivalent to a concealed Markdown marker and must not be judged against the marker conceal/reveal rules at all; see §2 for the explicit distinction.

### 1.7 Do not force implementation uniformity

This contract defines DOM/geometry/ownership invariants, not one mandatory CodeMirror decoration primitive for every Markdown construct. In particular, `Decoration.mark` is **not** mandatory for headings (or any construct) merely for architectural symmetry with blockquote. A construct migrates to real source-backed markers (1.5) only when there's a concrete interaction/layout reason to — an existing `Decoration.replace` approach may stay exactly as it is if its behavior is intentional and already tested.

---

## 2. Two rendering models — kept explicitly distinct

### Markdown marker conceal/reveal

```text
# Heading
> Quote
- Bullet
```

- Source characters remain real.
- Marker *presentation* may be hidden/revealed depending on engagement.
- Source-backed geometry (1.5) is used only when a construct actually needs it for caret/selection/layout correctness.

### Semantic UI replacement

```text
- [ ] Task
```

- The checkbox is an interactive product control, not a hidden-then-revealed marker.
- Widget replacement is allowed intentionally (1.6).
- This is not judged against, or forced into, the marker conceal/reveal model at all.

There is no universal rule in this agreement saying "markers are never widgets." The two models coexist by design, and a construct's own product intent — not a desire for architectural uniformity — decides which one applies.

---

## 3. `cm-` class-naming contract

`cm-` is the namespace the editor DOM already uses — kept intentionally, not reconsidered. It marks "this class lives inside the CM6-rendered DOM." Existing CodeMirror-owned classes (`cm-line`, `cm-activeLine`, `cm-content`, `cm-cursor`, `cm-selectionBackground`, `cm-gutters`, `cm-tooltip*` — confirmed via a full grep of the editor tree) are not ours and must never be redefined. Everything after `cm-` is Clutter's own vocabulary, and must be construct-specific and meaningful — not copied from another editor's DOM (Obsidian's `cm-formatting-*`/`HyperMD-*` included) simply because it appears in reference material.

```text
universal marker hook → cm-marker
structural             → cm-{construct}-line
marker                 → cm-{construct}-marker
content                → cm-{construct}
state                  → cm-{construct}-{role}--{modifier}
```

Examples:

```text
cm-quote-line
cm-marker cm-quote-marker
cm-quote
cm-marker cm-quote-marker--concealed

cm-marker cm-heading-marker
cm-list-marker
cm-bullet-list-marker
```

Notes, from directly inspecting the existing codebase rather than inventing a scheme from scratch:

- `cm-list-marker`/`cm-bullet-list-marker`/`cm-emoji-list-marker` already establish the `cm-{construct}-marker`/`cm-{qualifier}-{construct}-marker` pattern above — it predates this document and isn't a new invention.
- `cm-list-number` is a known, grandfathered exception to the `-marker` suffix — don't extend it; new marker classes take the suffix.
- `cm-table-row` is an accepted exception to the `-line` structural suffix, since "row" is the domain-correct word for a table.
- **`cm-marker` (added third pass, 2026-08-27) is the one deliberate exception to "no generic cross-construct names."** It exists specifically to answer the new product requirement — a single global styling hook for every independently-styleable Markdown marker (`.cm-marker { color: var(--marker-foreground); }`), so that hook doesn't have to be an enumerated per-construct selector list (`.cm-strong-marker, .cm-emphasis-marker, .cm-strike-marker, …`), which doesn't scale and is exactly the pattern the retired `.tok-mark`-based rule already showed the cost of. `cm-marker` is always a **second class alongside** a construct-specific `cm-{construct}-marker`, never a replacement for it — a marker span carries both (`class="cm-marker cm-quote-marker"`), so a construct can still be styled individually (a higher-specificity `.cm-quote-marker` rule) without touching the global hook. This is the sole exception "prefer a construct-specific name" makes room for; do not introduce a second generic cross-construct class for anything else without equally explicit justification.
- `tok-*` (`tok-heading1`–`6`, `tok-emphasis`, `tok-strong`, `tok-strike`, `tok-highlight`, `tok-code`, `tok-tag`, `tok-date`, `tok-link`, `tok-wikilink`, and the cross-cutting `tok-mark` modifier) is a separate, pre-existing, already-coherent naming system owned by `inlineLivePreviewParticipants.ts`/`markdownHighlightStyle.ts`. It is explicitly not renamed, merged with, or replaced by `cm-marker`/`cm-{construct}-marker` — the two systems answer different questions (`tok-*` = content styling; `cm-marker`/`cm-{construct}-marker` = marker styling) and a construct that migrates to this agreement's marker model keeps its existing `tok-*` content class completely unchanged. See §4.

---

## 4. Scope

This agreement governs the construct-specific marker system — originally structural/block-only, **explicitly extended in this third pass to the inline marker family**, per §4.1 below.

Governed by this agreement (marker DOM/class contract, §1–§3):

- blockquote (structural — done)
- heading (structural — not yet migrated, optional per §1.7/§6)
- list (structural — **explicitly deferred, see §4.2**)
- HR (structural — no marker to speak of)
- bold/strong, italic/emphasis, strikethrough, highlight, inline code, link, autolink, WikiLink (inline — **newly in scope as of this pass, see §4.1**; not yet migrated — see §7 for the plan)
- any future construct that explicitly adopts this model

Content styling for the inline family (`tok-emphasis`, `tok-strong`, `tok-strike`, `tok-highlight`, `tok-code`, `tok-link`, `tok-wikilink`, …) stays entirely owned by the existing `inlineLivePreviewRegion`/`tok-*` architecture, completely unchanged — see §4.1.

### 4.1 Amendment (third pass, 2026-08-27): inline formatting markers are in scope

**Superseded, explicitly, not silently:** the prior revision of this document stated that ordinary inline formatting (`**bold**`, `__bold__`, `*italic*`, `~~strike~~`, `` `code` ``, links, autolinks) "stays entirely on the existing `tok-*`/`inlineLivePreviewRegion` architecture" and that this agreement's marker classing "does not introduce separate marker spans, `cm-{construct}-marker` classes, or any part of §1–§3 for these." That statement is withdrawn for the reason §1.7 already names as the bar for migration: **a concrete product requirement now exists that the prior text didn't have to answer** — every Markdown syntax marker that needs independent styling (a global `--marker-foreground`/marker-color hook, applying to `**`, `__`, `*`, `_`, `~~`, `` ` ``, `#`, `>`, `[[`/`]]`, …, independently of its construct's content) must have a real, source-backed marker span carrying `cm-marker` + `cm-{construct}-marker`, per §3. This was not true, or at least not stated as a requirement, when the prior scope line was written; it is not a reversal of any product decision, only a scope update triggered by a new one.

**What does not change:**

- `tok-*` content styling is not replaced, renamed, or disrupted. A migrated construct keeps its existing `tok-emphasis`/`tok-strong`/etc. class on its content span exactly as today; only the marker's own representation changes.
- **Marker characters remain real, source-backed text in the DOM** for every construct that adopts this model — concealment is a styling/modifier state (matching blockquote's `--concealed` pattern), never `Decoration.replace()`-driven removal, for any construct migrated under this agreement.
- This amendment does **not** mandate identical internal markup across constructs — §1.7's "do not force implementation uniformity" applies exactly as before. A single-marker construct (heading) and a paired-marker construct (bold) naturally keep different shapes; only the marker-span/class contract itself is universal.
- This amendment is **not** justified by "another editor does it this way." The justification is Clutter's own product requirement (independently styleable markers, including a global marker color), stated once here and not re-derived per construct.

### 4.2 Lists remain explicitly out of scope for this pass

Nothing in §4.1 extends to list rendering. Restated concretely, not just by omission: no re-enabling of `listMarkerDecoration`/`listLineDecoration`/`listIndentWhitespaceDecoration`; no list DOM, CSS, or indentation changes; no list keyboard-behavior changes; no list indentation/DOM investigation, in this pass. §5.3's existing audit and §6 item 2's existing plan stand unchanged — list migration is evaluated later, only after the non-list marker architecture (§7) is complete, and remains its own separate design problem (variable marker width, arbitrary nesting depth) rather than a mechanical extension of §7. The distinct, already-existing custom Enter-key behavior (layered on top of, and using, CM6's own indentation info — not a separate keyboard model) is unaffected by any of this and is not in scope for review here.

---

## 5. Audit of existing constructs

Every claim below is sourced directly from the current files — file:line references included, current wiring status noted per construct.

### 5.1 Blockquote

**Wired:** yes (`blockquoteMarkerDecoration()`, `blockquoteLineDecoration()`).

```text
DOM/geometry agreement (§1): conforms
Naming contract (§3):        conforms (renamed 2026-08-27)
```

DOM: `<span class="cm-quote-marker[--concealed]">...</span><span class="cm-quote">...</span>` — two flat siblings, no wrapper (confirmed live). Marker is a real `QuoteMark` node (+ its own trailing separator, merged into one range) wrapped in `Decoration.mark`, never `Decoration.replace` ([`blockquoteMarkerDecoration.ts`](../apps/app/src/features/markdown/editor/codemirror/highlight/blockquoteMarkerDecoration.ts)). No `.cm-line` padding/margin/text-indent — `.cm-quote-line` is `position: relative` only, for the `::before` bar. Concealment toggled by `isPhysicalLineEngaged`, per-mark. This is exactly why blockquote needed 1.5 at all: the prior `.cm-line`-padding-based gutter caused the cross-boundary selection bug this construct's whole history is about; real-width markers are what replaced it.

**Naming gap resolved:** the class was `cm-formatting-quote`/`cm-formatting-quote--concealed` — copied from Obsidian's naming at Phase 1 time, predating §3 of this document. Renamed to `cm-quote-marker`/`cm-quote-marker--concealed` per §3, matching the pre-existing `cm-{construct}-marker` pattern `cm-list-marker` already established. Implemented as an isolated naming-only change (decoration class strings, CSS selectors, test assertions) — no DOM shape, engagement logic, or geometry touched; verified via the full existing test suite (67 relevant tests) and live-app DOM inspection in both engaged/concealed states.

Known, accepted gap unrelated to either contract: a *wrapped* quote line's continuation row carries no indent (a direct, flagged consequence of 1.4 — there is currently no in-flow mechanism reserving that space on a soft-wrapped row).

### 5.2 Heading

**Wired:** yes (`headingMarkerDecoration()`).

```text
Core invariants (§1): conforms — no violation found
Naming contract (§3): not applicable — no persistent marker element exists to name
Migration:             optional (§1.7) — not required by this agreement
```

At rest, `HeaderMark` (+ separator) is fully removed via `Decoration.replace({})` (`liveMarkDecoration.ts`'s `buildDecorations`; `getHeadingMarkRanges` never supplies a widget). Engaged, the real `#`/`##` text renders bare — CM6 adds no wrapping span for a range that was simply left uncollapsed. Marker and content are never merged in either state (1.2 is satisfied trivially: there's nothing to merge when the marker doesn't exist, and bare adjacent text is not "one element mixing both"). Source fidelity holds — nothing is rewritten. No `.cm-line` geometry is used at all (a heading has no gutter to reserve).

This construct does not need 1.5: it has no gutter/geometry problem for real markers to solve, and `liveMarkSelectionSnap.ts` already exists specifically to correct the one click-boundary edge case `Decoration.replace` can create — a working, tested mitigation, not an open bug. Per 1.7, heading has no concrete reason to migrate today. If one emerges (a specific interaction/layout problem, the same kind blockquote actually had), migrating to a persistent `Decoration.mark`-based `cm-heading-marker` span with a `--concealed` modifier is the pattern to reuse — not a scheduled item.

### 5.3 Lists (bullet / ordered / task)

**Wired: no.** `listMarkerDecoration()`, `listLineDecoration()`, `listIndentWhitespaceDecoration()` are all commented out in `MarkdownEditor.tsx` (confirmed by direct grep).

Bullet/ordered marker DOM already matches the naming contract: `<span class="cm-list-marker cm-bullet-list-marker">-</span>` (or `cm-list-number`), real `ListMark` text in a `Decoration.mark` — no replacement, no merging with content.

`.cm-list-line` **currently defines** `padding-left`/`text-indent` geometry in CSS ([`MarkdownEditor.css:169-175`](../apps/app/src/features/markdown/editor/MarkdownEditor.css)) — but since the list decoration extensions that would apply `.cm-list-line` are unwired, **this geometry is defined in CSS but not active in the current editor.** Its runtime interaction behavior (including whether it reproduces the same cross-boundary selection bug blockquote's own padding-based gutter had) **has not been verified and must be treated as unverified** until list rendering is re-enabled and actually tested — not asserted as a live bug.

Task markers (`- [ ] `) are `Decoration.replace({widget: TaskCheckboxWidget})` — full replacement, permanently, in every engagement state. Per §2, this is the **semantic UI replacement** model, not marker conceal/reveal, and is correctly modeled as such today. This is not a conformance gap to fix; it's the intentional pattern §1.6/§2 describe.

**What remains genuinely open, not yet a violation:** if/when list is re-enabled, `.cm-list-line`'s padding/text-indent geometry needs the same verification blockquote already went through — confirm whether it actually produces a cross-boundary selection defect, rather than assuming 1.4 is already broken. Bullet/ordered markers do not currently have any conceal/reveal behavior at all (they always render); whether to add it is a product decision, independent of this migration.

### 5.4 Other constructs

`tableDecoration.ts` and `emojiListMarkDecoration.ts` are dormant and not audited in depth here — flagged as unaudited, not as conforming or non-conforming. Tag and Date are widget-replace constructs (entirely atomic at rest, no marker/content split to speak of) and are not addressed by this pass — flagged as a later, separate question, not silently included or excluded.

### 5.5 Inline marker family — audit (third pass, 2026-08-27; §7.1 step 1 shipped and verified same day — see below)

**Status update (2026-08-27): §7.1 step 1 has shipped for the five constructs named below** (Emphasis, StrongEmphasis, Strikethrough, Highlight, InlineCode) — the audit text immediately following describes their *pre-migration* state and is kept for historical record, not current behavior. Current behavior: `delimitedInlineRenderer()` (`inlineLivePreviewParticipants.ts`) now takes a `markerClass` argument for these five constructs and emits `Decoration.mark({class: 'cm-marker cm-{construct}-marker cm-marker--concealed'})` for each marker range instead of `Decoration.replace({})` — real, source-backed marker spans in both engagement states, satisfying §1.2/§1.3. Autolink/Link/URL/WikiLink/Tag/Date are unaffected and still match the audit below as written (Autolink was never given a `markerClass`, still `Decoration.replace({})` — §7.1 step 2 not started).

**Verification performed (2026-08-27, "ordinary-marker verification pass"), reconciling Pass 2 (`docs/obsidian-vs-clutter-editor-audit.md`) experiment E4 with this document's own §7.2 checklist — see `docs/editor-architecture-decisions.md`'s "Ordinary-marker concealment verification" entry for full results.** Summary: real-Safari geometry re-confirmed (0-height, ~0.05px-wide concealed markers, matching the historical WebKit numbers, no line-height regression); Backspace/Delete at every marker boundary for all five constructs, the specific between-the-two-opening-`*` position in `**bold**`, Home/End through concealed runs, Shift-selection endpoints, and repeated/multi-step edit sequences were all verified via CM6's real command functions (`deleteCharBackward`/`deleteCharForward`/`cursorLineBoundaryForward`/`cursorLineBoundaryBackward`) against a real mounted `EditorView` — all passed, no document/caret/selection semantics changed by concealment. Mouse-click precision at the sub-pixel marker target could not be confirmed with a fully-trusted OS-level click (blocked by a macOS Accessibility permission this pass could not grant) — real-Safari `elementFromPoint`/`caretRangeFromPoint` behavior was checked instead and is consistent with expectations, but full trusted-click confirmation remains open. Accessibility (screen-reader announcement of concealed marker punctuation) could not be tested with a real screen reader in this pass; source inspection confirms no `aria-hidden` exists anywhere on `.cm-marker--concealed`, which is a real, plausible difference from the prior `Decoration.replace({})` behavior (which removed the marker text from the DOM, and therefore from the accessibility tree, entirely) — flagged as an open item, not fixed speculatively.

Original audit (pre-migration state, historical record):

Every claim sourced directly from current files. All seven constructs below currently use the **same non-conforming pattern**: marker concealment via `Decoration.replace({})` (the marker's text node is removed from the DOM entirely, not styled), content classed via `Decoration.mark` with a `tok-*` class. None currently satisfy §1.2/§1.3 for the marker side — there is no marker element to satisfy them with, in either engagement state.

**Emphasis (`*italic*`/`_italic_`), StrongEmphasis (`**bold**`/`__bold__`), Strikethrough (`~~strike~~`), Highlight (`==highlight==`), InlineCode`` (`` `code` ``) ``**

```text
1. Exact current DOM:        at rest — no marker node at all; content: <span class="tok-{emphasis|strong|strike|highlight|code}">text</span>
                              engaged — bare, unwrapped raw text (marker and content both unclassed)
2. Decoration mechanism:      delimitedInlineRenderer() factory, inlineLivePreviewParticipants.ts:96-140
                              (one shared factory behind all five node kinds, registered per-kind at
                              inlineLivePreviewParticipants.ts:335-339)
3. Marker vs content ranges:  marker = node.firstChild/node.lastChild (EmphasisMark/StrikethroughMark/
                              HighlightMark/CodeMark, by node kind) — Decoration.replace({}) each;
                              content = the range strictly between them — Decoration.mark({class: tok-*,
                              inclusiveStart/End: true})
4. Engaged/unengaged today:   selection-derived, via inlineLivePreviewRegion.ts's shared traversal —
                              isTokenEngaged() on the node's own range; engaged ⇒ traversal returns
                              false before calling the renderer at all (no decoration emitted, bare
                              source text with no distinction between marker and content ranges)
5. Marker-span feasibility:   Decoration.mark({inclusiveStart,inclusiveEnd:true}) already proven safe
                              for zero-gap-nesting at this exact boundary (documented at
                              inlineLivePreviewParticipants.ts:117-135) — the content mark already
                              relies on this. A sibling marker Decoration.mark at each end is the same
                              proven mechanism, not a new one. Real open risk: switching from
                              Decoration.replace (DOM removal) to Decoration.mark+`--concealed`
                              (color:transparent, real node retained) changes click hit-testing at the
                              marker's own position — exactly the tradeoff blockquote's own migration
                              named and accepted (MarkdownEditor.css:290-305) for a single-line marker;
                              unverified for a *paired*, both-sides marker under drag-selection and
                              Backspace-at-boundary, which blockquote's single-marker case never
                              exercised. Must be checked per §7 below, not assumed to transfer.
6. Existing tests:            inlineLivePreviewRegion.test.ts (shared — covers all five kinds' node
                              shape, concealment, engagement, nesting); emphasisLivePreview.test.ts /
                              strikethroughLivePreview.test.ts are already retired (superseded by the
                              file above, per docs/editor-architecture-decisions.md)
7. New tests needed:          DOM composition checks for <span class="cm-marker cm-{construct}-marker">
                              at rest and engaged; --concealed toggling verified against real mounted
                              EditorView (not decoration-shape assertions — see the "Shared DecorationSet
                              vs independent CM6 extensions" lesson in docs/editor-architecture-
                              decisions.md, which applies to swapping decoration primitive even within
                              the same shared factory); hit-testing/click-at-marker-position regression
                              (the specific new risk item 5 names); Backspace/Delete at a marker boundary
                              with the marker now real+concealed rather than absent
```

**Link (`[label](url "title")`), Autolink (`<https://…>`)**

```text
1. Exact current DOM:        at rest — no marker node; label content: <span class="tok-link">label</span>
                              (Link) or URL content (Autolink); everything from label-close through the
                              node's end (`](url "title")`) is one combined Decoration.replace, not
                              independently addressable
2. Decoration mechanism:      linkRenderer (bespoke, inlineLivePreviewParticipants.ts:221-272) for Link;
                              delimitedInlineRenderer('LinkMark', 'tok-link') (unmodified, reused) for
                              Autolink, registered inlineLivePreviewParticipants.ts:340,346
3. Marker vs content ranges:  Link: openMark ('[') and labelCloseMark (']') are the first two LinkMark
                              children — real markers; everything from labelCloseMark.from through
                              linkNode.to (`](url "title")`) is concealed as one combined range with no
                              internal marker/URL distinction today. Empty-label branch (`[](url)`)
                              additionally classes the URL itself tok-link as a fallback — a different
                              shape from the non-empty case, see inlineLivePreviewParticipants.ts:210-219.
                              Autolink: ordinary two-LinkMark-child shape, same as the five above.
4. Engaged/unengaged today:   same shared traversal/isTokenEngaged mechanism as the five above; both
                              stay inside inlineLivePreviewRegion.ts, no independent engagement logic
5. Marker-span feasibility:   Autolink: same as the five above, no new risk. Link: genuinely different —
                              its closing side is not a symmetric single marker but a variable-length
                              combined region (`](url "title")`) with no current internal split, and the
                              empty-label branch already special-cases which node gets tok-link. Turning
                              only the true marker characters (`[`, `]`, `(`, `)`, optional quotes around
                              title) into real cm-marker spans while leaving `url`/`title` concealed
                              (unchanged) needs its own small design decision, not a mechanical copy of
                              delimitedInlineRenderer's two-symmetric-marker shape. Treat as higher-effort
                              than the other six constructs in this family, size accordingly.
6. Existing tests:            inlineLivePreviewRegion.test.ts (Link and Autolink both covered — empty
                              label, nested WikiLink-in-label, DOM nesting under StrongEmphasis, etc.);
                              linkMouseHandlers.test.ts / urlMouseHandlers.test.ts (click activation —
                              unaffected by a marker-DOM-only change, but must be re-run to confirm)
7. New tests needed:          same DOM-composition/hit-testing/boundary-editing checks as the five above,
                              plus specific coverage for the empty-label branch's now-real markers and
                              for the fact that Link's marker is not one symmetric pair
```

**WikiLink (`[[filename|alias]]`)**

```text
1. Exact current DOM:        at rest — fully opaque widget (compact alias/filename render); `[[`/`]]`
                              do not exist as separate DOM nodes at all, concealed or otherwise
                              engaged — `[[`, filename, `|alias` (if present), `]]` all render as plain,
                              bare, unclassed text (wikiLinkLivePreview.ts:76-98); only the folder-prefix
                              substring is concealed (Decoration.replace({}))
2. Decoration mechanism:      standalone extension, wikilink/wikiLinkLivePreview.ts — NOT
                              inlineLivePreviewParticipants.ts/delimitedInlineRenderer; its own
                              ViewPlugin, own traversal, own engagement widening
                              (widenToEnclosingLivePreviewRegion, wikiLinkLivePreview.ts:55-63)
3. Marker vs content ranges:  at rest: none — the entire node is one Decoration.replace({widget}),
                              atomic; the `[[`/`]]` characters are never independently addressed even
                              conceptually at rest. Engaged: node.from..node.from+2 ('[['), node.to-2..
                              node.to (']]') are the only candidate marker ranges, currently rendered as
                              part of the same undifferentiated bare-text region as filename/alias.
4. Engaged/unengaged today:   NOT the shared inlineLivePreviewRegion mechanism — its own
                              isTokenEngaged() call against a widened boundary computed by walking
                              ancestor delimited-mark constructs (documented rationale:
                              wikiLinkLivePreview.ts:19-53); this is real, independent logic, not a
                              thin wrapper around the shared traversal
5. Marker-span feasibility:   Explicitly flagged by the user as needing separate audit before any
                              migration, and this audit confirms why: WikiLink's at-rest form has no
                              real `[[`/`]]` text at all to turn into a marker span (it's a single
                              opaque widget) — a marker DOM contract only has meaning for its *engaged*
                              state, which is architecturally different from every other construct in
                              this family (WikiLink already deliberately opted out of the shared
                              reveal-on-engage contract once, per docs/editor-architecture-decisions.md's
                              "WikiLink-specific rationale" section, precisely because its contract is
                              genuinely different). Concretely: is a `cm-marker cm-wikilink-marker` span
                              wanted only in the engaged state (the only state where `[[`/`]]` exist as
                              real, position-addressable text), with the at-rest widget staying exactly
                              as it is? That is a real product/architecture question to answer
                              explicitly, not an implementation detail to default on.
6. Existing tests:            wikiLinkLivePreview.test.ts, wikiLinkSelectionSnap.test.ts
7. New tests needed:          depends entirely on the item-5 decision above; not sized until that
                              question is answered
```

---

## 6. Proposed Phase 2 — not started, not approved

1. **Heading migration is optional**, not scheduled. It requires a concrete UX/interaction reason (mirroring the kind of real, reproduced bug that justified blockquote's own migration) — not architectural symmetry. The existing `Decoration.replace` approach may remain indefinitely if its behavior stays intentional and tested. If a reason does emerge, the smallest change is: real `Decoration.mark` over `HeaderMark` (+ separator) in both engagement states, `cm-heading-marker`/`cm-heading-marker--concealed`, as a bespoke per-construct mechanism (matching blockquote's own choice not to modify the shared `liveMarkDecoration.ts` for every consumer at once) — re-evaluate whether `liveMarkSelectionSnap.ts` is still needed for heading at that point, not before.
2. **List — bullet/ordered markers.** Before any DOM change: re-enable and verify whether `.cm-list-line`'s current padding/text-indent geometry actually reproduces a cross-boundary selection defect (§5.3) — do not assume it does. If it does, the migration is a genuinely new design problem, not a mechanical copy of blockquote's pattern: list markers vary in width and nest to arbitrary depth, unlike blockquote's fixed single bar.
3. **List — task checkboxes are explicitly out of this migration.** They're correctly modeled today under the semantic UI replacement path (§2), not the marker conceal/reveal path — no change proposed.

No code has been changed by this document. Naming-contract renames (blockquote's `cm-formatting-quote` → `cm-quote-marker`) happen in a future change that touches the relevant file, not as part of writing this agreement.

---

## 7. Proposed Phase 2.5 — inline marker family — not started, not approved

Scope: the seven constructs audited in §5.5. **Lists are not part of this plan, at all, in any step** — see §4.2. Task checkboxes remain the semantic-UI-replacement model (§2) and are untouched.

### 7.1 Ordering

1. **Emphasis + StrongEmphasis + Strikethrough + Highlight + InlineCode together, as one change to `delimitedInlineRenderer`.** They share one factory today (`inlineLivePreviewParticipants.ts:96-140`) and share one non-conformance; migrating the factory once migrates all five, which is smaller and less risky than five parallel bespoke changes that could drift from each other. This is the first slice — it has no open design question (§5.5 item 5 for these five has a known-safe path, only an unverified-but-scoped risk to check), unlike Link or WikiLink.
2. **Autolink**, immediately after or alongside step 1 — it already reuses `delimitedInlineRenderer` unmodified today, so it inherits the migration for free once the factory changes; verify it explicitly rather than assuming inheritance is complete, since Autolink's content is a `URL` node, not free text, and hasn't been checked against the new marker span specifically.
3. **Link**, as its own slice, after 1–2 are verified working in the real app. Per §5.5, its marker shape (asymmetric, variable-length concealed region, an empty-label special case) is genuinely different from the five-construct factory and needs its own small design pass — do not attempt to force it through the same factory as step 1.
4. **WikiLink**, last, and only after the open question in §5.5 item 5 (does a marker span apply to the engaged state only, leaving the at-rest widget untouched?) is answered explicitly. Do not fold WikiLink into steps 1–3's implementation; it is on a structurally different mechanism (`wikiLinkLivePreview.ts`, not `inlineLivePreviewParticipants.ts`) and was already extracted once for a genuinely-different-contract reason that this migration must not quietly re-collapse.

### 7.2 What "done" means per slice, before moving to the next

- Real, source-backed `<span class="cm-marker cm-{construct}-marker">` (plus `--concealed` modifier, toggled by the existing `isTokenEngaged`-derived engagement, matching blockquote's `color: transparent` technique) replaces the corresponding `Decoration.replace({})` marker range — content's existing `tok-*` `Decoration.mark` is untouched.
- The standalone-renderer verification checklist already in `docs/editor-architecture-decisions.md` ("Standalone-renderer verification checklist," 12 items — decoration precedence, DOM nesting, inclusive boundaries, nested Markdown, cursor at every boundary, cursor inside child, cursor inside enclosing-but-outside-child, exit behavior, atomic ranges, selection, autocomplete/raw-text mechanisms, document immutability) is run against a real mounted `EditorView`, not just decoration-shape assertions — even for constructs staying inside the shared `inlineLivePreviewRegion` traversal, since the primitive itself (`replace` → `mark`) is changing, which is exactly the class of change that document's own regressions were caused by.
- Click hit-testing at the marker's own (now-real, concealed) position is explicitly tested — the specific new risk §5.5 names, and the reason blockquote's own doc comment states its `color: transparent` choice as a visible, accepted tradeoff rather than a solved problem.
- `docs/editor-architecture-decisions.md` and this document are updated to record what shipped, per this repo's existing practice of recording standalone-renderer regressions and fixes as they're found — not just this planning document.

### 7.3 Explicit non-goals of this plan

- No change to `tok-*` classes, `inlineLivePreviewRegion.ts`'s traversal/engagement algorithm, or any construct's content-side rendering.
- No new keymap, cursor-interception, or selection-snap mechanism beyond what a given construct already has (`liveMarkSelectionSnap.ts` for heading, `wikiLinkSelectionSnap.ts` for WikiLink) — this is a decoration-primitive change, not a return to bespoke keyboard handling.
- No implementation in this pass. This section is the bounded plan requested; code changes wait for explicit review of it.
