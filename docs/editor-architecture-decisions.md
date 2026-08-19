# Editor Architecture Decisions

## Purpose and scope

This is **not** an ADR and not a research document. It is a concise lookup layer over the Markdown editor's architecture Q&A — the semantic-inline construct thread specifically (parser design, grammar, resolution semantics, the shared interaction contract). Its only job is to let a reader, including a cold-start Claude session, answer *"is X already decided, and under what conditions?"* in under a minute, without reading the full research archive.

The full reasoning, worked examples, counter-examples, and scenario walkthroughs behind every entry below live in [`docs/editor-research/`](./editor-research/README.md) — **that is the evidence layer; this is not.** Entries here are deliberately terse. When an entry's "why" isn't enough to settle a disagreement, follow its link rather than re-deriving the reasoning from scratch.

**Relationship to ADRs**: none of this is an ADR yet, by design (per the working decision on how to document this phase of work). Once this architecture stabilizes, the small number of genuinely foundational, durable commitments here (candidates: CodeMirror 6 as the engine, Markdown as sole canonical source with no second document model, one shared interaction mechanism for semantic inline constructs) should graduate into real ADRs in `docs/adr/`, matching the scale of `ADR-017`/`ADR-020`. The much larger volume of fine-grained grammar/precedence/interaction decisions below is not expected to ever need that treatment individually.

**Earlier, separate phase of work not covered here**: the Markdown editor behavioral specification (`clutter-editor-interaction-spec-v0.2.md`), the three architecture-blocking-decision resolutions, the architecture proposal, and the bounded implementation plan are prior, self-contained deliverables with their own internal decision/open-item summaries. This log does not re-capture them — it picks up from the semantic-inline construct Q&A that followed.

## Status key

- **Locked** — settled; treat as a fixed constraint for any further work in this area.
- **Recommended, not locked** — a considered, evidenced recommendation, but not yet a product/architecture commitment. Do not build against it as if it were Locked without checking whether it's since been promoted.
- **Superseded** — an earlier position that was explicitly reversed. Kept visible on purpose so nobody re-discovers the same dead end.
- **Open** — a genuine, named unresolved question. Not silently decided by omission.

---

## Verified against installed APIs (2026-08-18)

No CodeMirror/Lezer package is installed in this repo yet (`apps/app/package.json` has no `@codemirror/*`/`@lezer/*` dependency as of this check) — everything below was verified against the packages' own published source/type declarations on the npm registry, not against code running in this repo. Re-confirm after the actual `npm install` pins versions, as a cheap sanity check, not because drift is expected.

Validated, mutually compatible version set: `@codemirror/view@6.43.9`, `@codemirror/state@6.7.1`, `@codemirror/lang-markdown@6.5.2`, `@codemirror/commands@6.11.0`, `@codemirror/autocomplete@6.20.3`, `@lezer/markdown@1.7.2`, `@lezer/common@1.2.3`. `@codemirror/lang-markdown@6.5.2`'s own declared peer ranges (`@lezer/markdown: ^1.0.0`, `@lezer/common: ^1.2.1`, `@codemirror/state`/`@codemirror/view: ^6.0.0`, `@codemirror/autocomplete: ^6.7.1`) are all satisfied by this set.

- **`MarkdownConfig`, `InlineParser`, `BlockParser` shapes confirmed exactly as assumed** — `InlineParser.parse(cx, next, pos): number`, `before`/`after` as plain string fields naming another parser. No corrections to the parser-architecture decision.
- **GFM's `Autolink` inline parser is registered under the literal name `"Autolink"`, with no `before`/`after` of its own** — confirmed by reading `@lezer/markdown`'s own source. This resolves the previously-open item: the `@`-family parser should be registered `after: "Autolink"` directly; no ambiguity remains.
- **GFM's `Strikethrough` parser is registered `after: "Emphasis"`** — confirmed real (not just inferred precedent) evidence that delimiter-based custom inline constructs are already proven to compose correctly with `Emphasis` in the shipped grammar.
- **No dedicated "node group" feature exists in `@lezer/markdown`** — confirmed the package "delegates to Lezer's core infrastructure" rather than offering its own tagging mechanism. **Recommendation, not a spec requirement**: the shared interaction layer's "is this any semantic-inline node" query should be a plain check of `node.type.name` against a small, fixed `Set` of Clutter's own node type names (`WikiLink`, `Tag`, `Mention`, `PropertyToken`, …) — simpler than wiring a custom `NodeProp`, and sufficient given the fixed, known set of kinds. A custom `NodeProp` (attached via `defineNodes`'s per-node `props`) remains available later if the set ever needs to be dynamically extensible, which nothing today requires.
- **`Decoration.replace`, `Decoration.widget`, `WidgetType`, and `EditorView.atomicRanges` all confirmed to exist with the assumed shapes.** One precision worth recording: `atomicRanges` affects cursor-motion and deletion commands, but does **not** prevent programmatic selection changes — doesn't contradict anything locked, just a detail worth knowing before relying on it for anything beyond keyboard interaction.
- **`atomicRanges` should be applied to tokens at rest, but deliberately *not* to ordinary Live-Preview-hidden inline marks (bold/italic/etc.).** This wasn't previously stated as sharply: at-rest atomic whole-token deletion is the *desired* behavior for semantic tokens (already Locked), but the same combination on an ordinary hidden formatting marker would reintroduce the "whole range deletes in one step" problem the original audit already flagged as a bug pattern to avoid. Both use `Decoration.replace`/`WidgetType`; only tokens additionally register in `atomicRanges`.
- **Decoration position stability via `RangeSet.map(changeDesc)` confirmed real** — not an assumed mechanism.

## Reference vocabulary

Concepts reused across many entries below; defined once here rather than re-explained per entry.

- **Reveal-on-engagement**: the shared lifecycle for every semantic inline construct. *At rest*: rendered as a collapsed/atomic widget. *Engaged*: raw Markdown revealed, ordinary character-level editing applies. Engagement is **derived**, not stored — see next entry.
- **Engagement is derived from selection**: a construct is engaged if and only if the current CM6 selection (including a zero-width caret) lies strictly within its syntax range. There is no engagement flag anywhere. This is why undo/clipboard/accessibility all "just work" for these constructs without bespoke code — anything defined purely in terms of selection inherits CM6's already-correct handling for free.
- **The one-way pipeline**: Stored Markdown → Parsed syntax → Semantic resolution → Display label → User activation. One direction only — there is no arrow from display back to stored. **Serialization** is the one exception, and it only ever fires once, at insertion time (e.g. autocomplete acceptance) — never as an ongoing re-derivation of already-existing text.
- **The shared semantic descriptor**: `{ kind, resolve, displayLabel, activate, validate, serialize }`, supplied per construct kind. `resolve`, `validate`, and `activate` are each **optional per kind** — not every kind needs all three meaningfully (e.g. a tag leans on `resolve`, `@due` leans on `validate`, neither needs both). `resolve()` returns **resolved / unresolved / ambiguous**, never a bare boolean — silently picking a candidate on ambiguity is never acceptable.
- **Lenient reader, strict writer**: Clutter's parser tolerates non-canonical-but-valid existing text (extra whitespace, `.`/`..` in paths, unnecessary-but-valid escapes) and never rewrites it just because it was read. Clutter's own writer always produces normalized, canonical text. Applied repeatedly across path normalization, alias trimming, and WikiLink escaping.

---

## Foundational principles (Locked)

All originate in the earlier architecture-proposal phase; restated here because every later document in this archive depends on them.

- **Markdown remains the sole canonical source of truth at all times.** No second/parallel rich-document model is ever introduced as a competing source of truth.
- **No second, independent parser.** Clutter-specific syntax is recognized through the exact same parse as CommonMark/GFM — never a regex/scanner pass running alongside it.
- **Clutter syntax extends `@lezer/markdown`'s public `MarkdownConfig` mechanism** (`parseBlock`/`parseInline`/`defineNodes`/`props`) — the same mechanism GFM's own Table/TaskList/Strikethrough/Autolink extensions are built on, confirmed against the library's own documentation, not assumed. See [parser-architecture.md](./editor-research/clutter-editor-parser-architecture.md).
- **Distinct Lezer node types per semantic kind** (`WikiLink`, `Tag`, `Mention`, `PropertyToken`, …) — not one generic `SemanticInline(kind=...)` node. A shared node-group/prop tags the family for the interaction layer's generic queries; grammar stays per-kind. See [shared-semantic-inline-model.md](./editor-research/clutter-editor-shared-semantic-inline-model.md).
- **One shared interaction mechanism for every inline semantic construct** — rendering, engagement, selection, deletion, clipboard, undo/redo, IME, and accessibility are shared infrastructure; only resolution, display label, activation, validation, and serialization are type-specific. Explicitly scoped to **inline** constructs — a future block-shaped construct (e.g. a full transclusion) is not assumed to fit this mechanism. See [shared-token-interaction-contract.md](./editor-research/clutter-editor-shared-token-interaction-contract.md).
- **Native CommonMark/GFM meaning must never be compromised.** A Clutter extension may only claim text that would otherwise remain literal — amended below with a precision the original one-line rule was missing.
- **Plain Markdown links (`[text](url)`) remain ordinary Live Preview marks**, not semantic tokens — validated, not assumed: link display text is exactly the content users routinely edit character-by-character, which atomic treatment would actively harm.
- **Images participate in the semantic-token/reveal-on-engagement family**, unlike plain links — validated for a different, firmer reason: an image's at-rest form is an actually-rendered widget, not styled text with hidden markers, which is structurally a token-family concern regardless of how often alt-text gets edited.

---

## Parser precedence & grammar

- **CommonMark/GFM-always-wins needs one addition, not just "ordering."** *Locked.* Where a Clutter trigger is a strict prefix of a built-in trigger (`[[` vs `[`, `![[` vs `![`), `before`-ordering (e.g. `before: "Link"`) is necessary but **not sufficient** — the extension's own matcher must also verify no valid built-in continuation (`(` or `[`) follows its closer, or a genuine CommonMark link like `[[Project A]](url)` would be silently misinterpreted. Where trigger characters share a start character but not a start *position* (`@mention` vs. GFM email autolink, whose match begins before the `@`), ordering alone (`after: Autolink`) is sufficient. See [precedence-validation.md](./editor-research/clutter-editor-precedence-validation.md).
- **`#tag` vs. ATX heading resolves automatically**, no extension logic needed — CommonMark's own space-required rule already prevents collision; block- and inline-level parsing are separate phases, so they never compete for the same dispatch point.
- **WikiLink requires `before: "Link"` plus the continuation-lookahead check above.** *Locked.* The same pattern applies identically to a future `![[embed]]` vs. `Image`.
- **WikiLink grammar and escaping — full formal rules.** *Locked.* Summary: backslash escapes exactly one following character, reusing CommonMark's own escapable-punctuation set (**semantic-rule reuse, not delegation** — the WikiLink parser's own scan must implement escape recognition itself; the generic `Escape` node never gets an independent turn inside an already-claimed WikiLink range — this was an imprecision in the first pass, corrected explicitly). First unescaped `|` is the separator, and only the first — further unescaped pipes are just alias text. First unescaped `]]` always terminates (lazy match, not greedy). No WikiLink nesting — an inner `[[` is never treated as a nested start. The parser never produces a partial node: either a complete, validly-closed structure is found, or the whole span falls through to ordinary text. See [wikilink-grammar.md](./editor-research/clutter-editor-wikilink-grammar.md).
- **Canonical serialization escapes every literal `]`, not only `]]`-forming pairs.** *Locked, corrected from an ambiguous first phrasing.* A naive "only escape adjacent `]]` found in the data" rule is unsafe, not merely non-minimal — a lone trailing `]` (e.g. `path = "A]"`) can silently combine with the closer written immediately after it (`[[A]]]` mis-parses), a boundary case invisible to a scan of the data alone. Escaping every `]` unconditionally is both simpler (context-free) and actually correct. See [wikilink-grammar-corrections.md](./editor-research/clutter-editor-wikilink-grammar-corrections.md).
- **Round-trip invariant, precisely stated.** *Locked, corrected from an overstated first version.* `parse(serialize(v)) == normalize(v)` — **not** `== v` for arbitrary unnormalized input. The writer trims whitespace as part of serialization, so exact equality only holds when `v` was already normalized. Canonical-serialization stability (repeated serialization doesn't drift) still holds, since `serialize()` is a pure function of the decoded value alone, never of prior raw text.

---

## Shared semantic-inline interaction contract

- **Engagement mechanics reconcile "atomic" and "arrow-key-enterable."** *Locked.* A one-position hop treats the token as a single atomic unit for that keypress; a *second* press once the caret is already at the boundary steps inside. Same mechanism at two distances, not two mechanisms.
- **The hop lands on the boundary facing the direction of approach, never the opposite side.** *Locked, supersedes the earlier "passing through from a distance" reading of the entry above.* The previously "flagged for prototype confirmation" felt-experience was resolved: `ArrowLeft` toward a token from its right (with or without intervening whitespace/text) must land the caret at the token's right/near boundary, engaging it from the right — never jump clean through to the far/left boundary. Symmetrically for `ArrowRight` from the left. A hop never makes the caret appear to have "passed through" the token to its far side in one press.
- **Keyboard-only activation gap.** *Locked as a requirement, previously unstated anywhere.* The boundary-entry gesture gets a keyboard user into editing, but does not itself invoke `activate()`. A defined key (e.g. Enter, when the caret sits adjacent to an at-rest token) must trigger the same action a click would, or keyboard-only users can edit every token but never activate one.
- **Selection touching a token from outside never partially reveals it.** *Locked.* A selection gesture that starts before or ends after a token's range sweeps it in as one atomic unit; a gesture that would land partway inside snaps outward to the nearest boundary. Prevents a drag across a token-dense line from exploding every token into raw text at once.
- **No trap state.** *Locked.* Leaving an engaged token is just continuing to move the cursor or clicking elsewhere — never a required special action.

See [shared-token-interaction-contract.md](./editor-research/clutter-editor-shared-token-interaction-contract.md) for the full state model, selection/deletion/undo/clipboard mechanics, and the accessibility baseline.

---

## WikiLink resolution, aliases, and display

- **Display-label precedence, corrected from the originally proposed ordering.** *Locked.* **Local alias > target's primary frontmatter alias > filename** — not "filename > target aliases" as first proposed. Putting filename above target aliases would mean a page's alias never actually changes how it displays anywhere unless every reference is hand-edited, defeating much of the point of having page-level aliases. This does **not** conflict with "editing frontmatter never rewrites references" — that guarantee is about the stored buffer; display is a pure, always-re-derived render, the same "derived data is disposable" pattern already governing every decoration in this architecture. See [semantic-resolution-model.md](./editor-research/clutter-editor-semantic-resolution-model.md).
- **Bare-reference display is live and dynamic, never written back.** *Locked.* Renaming a target's primary alias changes what every bare (no-local-alias) reference to it shows, with zero buffer mutation anywhere. A reference carrying an explicit local alias is completely unaffected, forever, unless a user edits it directly.
- **Alias-based resolution (`[[Alpha]]`) is supported as a fallback**, tried only after a literal path match fails. *Locked.* The Markdown is never auto-rewritten to the canonical path on resolution — resolution never causes a write, without exception.
- **Ambiguous alias/mention matches must produce an explicit ambiguous resolve state, never a silent pick.** *Locked.* Silently choosing a candidate risks opening or editing the wrong entity without the user realizing — a materially worse failure mode than an honest "please disambiguate."
- **Path normalization**: vault-relative, `/`-separated, no `.`/`..`, no extension, in Clutter's own canonical writer — but the parser remains tolerant of reading non-canonical-but-valid variants without ever rewriting them. *Locked.*
- **Autocomplete acceptance is insertion-only, never navigation.** *Locked.* Accepting a WikiLink completion — the `+ Create "X"` option, an existing-page option, via click, Enter, or the `|` alias-boundary key — only inserts (and, for `+ Create`, creates) the reference; it must never make the newly-referenced/created page the active view, and the editor keeps focus. The only thing that opens/navigates to a WikiLink is an explicit `activate()` on an already-rendered token (a genuine click on the token itself, or the keyboard adjacent-activation path) — never a side effect of the insertion mechanism that produced it.

---

## `@Today` / relative dates — reversal, capture explicitly

- **`@Today`/`@Tomorrow` are insertion-time shorthand only, never persistent syntax.** *Locked.* **This reverses an earlier working assumption**, carried through the shared-token-interaction-contract and semantic-resolution-model documents, that `@Today` was a fifth persistent token kind exactly like `WikiLink`/`Tag`/`Mention`/`@due`, with its own `DateToken` node. That assumption is superseded — accepting "Today" immediately writes the concrete literal date; nothing named `@Today` ever reaches the buffer. Reasoned from two angles that converged: (1) a persistent-but-frozen reading is architecturally impossible without hidden state, which is explicitly forbidden; (2) a persistent-and-dynamic reading fails both worked scenarios (a daily note's own `@Today` drifting off its dated identity; a recorded "launch date" silently changing every day). See [relative-date-semantics.md](./editor-research/clutter-editor-relative-date-semantics.md).
- **Consequence**: the `@`-family parser's disambiguation simplifies from three branches (Mention/DateToken/PropertyToken) to two (Mention/PropertyToken) — less parser complexity than previously planned, a direct benefit of the reversal, not a cost.
- **`@due:@Today` needs no recursion.** *Locked.* Nothing persistent exists to nest; malformed input is handled exactly like any other invalid property value.
- **A non-recursive path for a future relative due-date exists** (`@due:today` as a literal keyword inside `PropertyToken`'s own value grammar) but is **not decided to be built** — see Open items below.

---

## Editor/persistence boundary (carried from the architecture-proposal phase, restated for continuity)

- **The editor never imports `Vault`/`VaultQuery`/`EffectivePageState`/`PageOperations` directly.** Suggestion candidates and asset resolution are always injected via props. *Locked.*
- **CM6's undo history is scoped to the mounted editor instance**, and this is already guaranteed for free by the existing `key={activePageId}` remount pattern in `PageHost.tsx` — confirmed by direct inspection during the implementation-plan phase, not merely proposed. *Locked.*
- **CM6-local undo history and `DocumentSession`'s Committed-stage revisions must never be conflated.** Two distinct mechanisms, no shared code path. *Locked.*

---

## Open — genuinely unresolved, not silently decided

- **Case-sensitivity of WikiLink path matching** relative to `VaultPath`'s actual existing behavior — flagged honestly as uncertain in the grammar research, not confirmed against the real implementation.
- **Folder-path targets** (`[[Projects]]` where `Projects` is a folder, not a page) — recommended default is "treat as unresolved," not locked.
- **Empty local alias** (`[[path|]]`) treated as display-equivalent to "no local alias" — recommended, not locked.
- **Whether tags resolve to a Page-like entity or a distinct existence-check projection** — depends on the actual shape of the existing `core/application/tags` module, not independently inspected during this research.
- **Unresolved-mention click behavior** (offer to create a person/entity, mirroring WikiLink's create-on-click) — genuinely depends on whether a person/entity system exists at all, which is out of scope for the editor's own architecture.
- **Whether a deliberately-relative "live template" construct is wanted at all**, as a distinct, separately-syntaxed feature from ordinary `@Today` shorthand — real use case named, not designed, would need its own syntax if built.
- **Whether `@due:today`/`@due:tomorrow` relative keyword values are wanted** — the non-recursive mechanism is defined; whether to build it is undecided.
- ~~Exact GFM node name to order the `@`-family parser `after:`~~ — **Resolved 2026-08-18, see "Verified against installed APIs" below.**
- ~~Exact resulting tree shape when a semantic token nests inside `**bold**`~~ — **Resolved 2026-08-18, during WikiLink implementation (§4).** Empirically confirmed via direct tree inspection of `**[[Page]]**`: `WikiLink` sits as a direct child of `StrongEmphasis`, between its two `EmphasisMark` children (`StrongEmphasis > [EmphasisMark, WikiLink, EmphasisMark]`) — exactly the composition predicted by analogy with GFM's own `Strikethrough`-inside-`Emphasis` precedent. Covered by a permanent regression test, not just a one-off check: `markdownLanguage.regression.test.ts`.
- **Engagement gesture felt-experience** (does "press again at the boundary" read as discoverable) — carried forward from the architecture-decisions phase as a standing prototype item, not resolved by any document in this archive.
