# Editor Research & Validation Archive

These are the working research/validation documents behind `docs/editor-architecture-decisions.md`. They are the **evidence layer** — worked examples, counter-examples, stress-tested scenarios, and the reasoning behind each decision — not a lookup layer. Read the decision log first; come here only when you need to see *why*, not just *what*.

They are preserved close to their original form deliberately, per the decision log's own governing rule: **the research documents are not rewritten into summaries that lose the original reasoning.** Do not edit these to "clean them up" — if a finding here is later corrected, add a new document or a note in the decision log pointing to the correction, the way `clutter-editor-wikilink-grammar-corrections.md` already does for `clutter-editor-wikilink-grammar.md`.

Listed in the order the underlying architecture Q&A actually happened, which is also the order that makes each document's context easiest to follow:

| Document | Covers |
|---|---|
| [clutter-editor-semantic-tokens-audit.md](./clutter-editor-semantic-tokens-audit.md) | Initial audit: whether `[[links]]`, `#tags`, `@mentions`, `@dates` should share one architecture; syntax precedence gaps; cross-document reference propagation gap |
| [clutter-editor-shared-semantic-inline-model.md](./clutter-editor-shared-semantic-inline-model.md) | Validates the shared-interaction-mechanism principle; precise distinction between interaction infrastructure, semantic model, and parser node |
| [clutter-editor-parser-architecture.md](./clutter-editor-parser-architecture.md) | Recommends distinct Lezer node types via `@lezer/markdown`'s public extension mechanism, fact-checked against the library's own docs; rejects a second parser |
| [clutter-editor-precedence-validation.md](./clutter-editor-precedence-validation.md) | Amends the CommonMark/GFM-always-wins rule: ordering alone isn't sufficient for prefix-sharing constructs (`[[` vs `[`); a continuation-lookahead check is also required |
| [clutter-editor-shared-token-interaction-contract.md](./clutter-editor-shared-token-interaction-contract.md) | Full state model: engagement derived from CM6 selection containment, never stored; cursor/selection/deletion/undo/clipboard/accessibility mechanics |
| [clutter-editor-semantic-resolution-model.md](./clutter-editor-semantic-resolution-model.md) | Resolution/display-label/activation/serialization semantics for WikiLinks, tags, mentions, dates, properties; corrects the originally-proposed alias display precedence |
| [clutter-editor-relative-date-semantics.md](./clutter-editor-relative-date-semantics.md) | `@Today`/`@Tomorrow` — reverses the earlier assumption that these are persistent tokens; insertion-time shorthand only |
| [clutter-editor-wikilink-grammar.md](./clutter-editor-wikilink-grammar.md) | Full WikiLink grammar: escaping, delimiter/closing rules, canonical serialization, round-trip invariants, malformed-input handling |
| [clutter-editor-wikilink-grammar-corrections.md](./clutter-editor-wikilink-grammar-corrections.md) | Addendum: corrects the round-trip invariant's precision, clarifies CommonMark-escaping reuse is semantic not delegated, validates escape-every-`]` over escape-only-`]]`-pairs |

Scope note: this archive covers the **semantic-inline construct architecture** thread specifically (parser, grammar, resolution, interaction contract). The earlier Markdown editor behavioral specification, architecture-blocking-decision resolution, architecture proposal, and bounded implementation plan are a separate, earlier phase of work and are not part of this archive.

## Later, separate thread: keyboard ODR and live-preview rendering

These followed the semantic-inline thread above and are not part of it — read them independently:

| Document | Covers |
|---|---|
| [legacy-editor-keyboard-behavior-recovery.md](./legacy-editor-keyboard-behavior-recovery.md) | Forensic reconstruction of `packages-archived/editor`'s keyboard/selection model (not a decision document) |
| [canonical-keyboard-odr-v1.md](./canonical-keyboard-odr-v1.md) / [canonical-keyboard-odr-v2.md](./canonical-keyboard-odr-v2.md) | The 3-space canonical indentation contract for Tab/Shift-Tab/Enter/Backspace |
| [keyboard-odr-test-matrix.md](./keyboard-odr-test-matrix.md) | Test matrix accompanying the ODR |
| [backspace-indentation-investigation.md](./backspace-indentation-investigation.md) | Backspace-specific indentation investigation |
| [inline-live-preview-region-odr-v1.md](./inline-live-preview-region-odr-v1.md) | **Accepted, binding.** Locks how Live Preview visibility resolves for *nested* inline constructs: at the structural rendering-region level (outermost engaged participant wins), never per construct and never per plugin. Records the Emphasis/Strikethrough plugin split as a non-contractual implementation artifact subject to consolidation, and carries the migration plan |
| [cm6-live-preview-rendering-architecture.md](./cm6-live-preview-rendering-architecture.md) | Research (not yet decided) on how to render Markdown constructs with syntax concealed while keeping `state.doc` sole source of truth and native CM6 editing behavior fully intact — includes forensic diagnosis of why the earlier rendering attempt broke keyboard/selection behavior (reset in commit `58c7d9d7`), CM6 source-verified decoration/atomicRanges/clipboard/IME behavior, real-world implementation survey (Obsidian, atomic-editor, codemirror-live-markdown), and a per-construct decoration matrix |
