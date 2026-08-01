# ADR-004: Lazy Evaluation for Speculative Projections Instead of Deletion

**Status:** Accepted

## Context

The review found a fully-built, unit-tested link-resolution/knowledge-graph subsystem (`KnowledgeGraphBuilder`, `LinkResolver`, `PageIndex`) plus embed and alias indexing, all rebuilt on every single page mutation, with zero consumers found anywhere outside their own tests — no backlinks panel, no embed renderer, no alias-based lookup feature exists in the shipped UI. This is real, uncompensated CPU cost today (a full rebuild on every save) for functionality nobody can currently use, and it was flagged as the clearest example of infrastructure built ahead of product validation.

The question is what to do about code that is well-built, not currently harmful to correctness, but currently wasteful and unvalidated by any real feature.

## Decision

Keep the code. Change when it runs: `Vault.knowledgeGraph()` and `Vault.embeds()` become lazy getters that invalidate on mutation but only rebuild on the next access, rather than rebuilding unconditionally inside every `refreshProjections()` call. Alias extraction stays wired into the ingest pipeline (it's cheap, single-pass, and already needed for `PageIndex`'s alias lookups if the graph is ever queried) but is not surfaced as a public `Vault` API until something consumes it.

## Alternatives Considered

- **Delete the knowledge graph, embed, and alias code entirely.** Rejected: this is real, correct, tested code for features that are plausible near-term product direction (backlinks are a common and expected feature for this class of app). Deleting it means re-deriving the same design later, at the cost of the design and testing effort already spent. The review's own principle — "every abstraction must earn its existence" — cuts against speculative *construction*, not against *retaining* something that already exists and is proven correct, when the retention cost is near zero.
- **Keep it exactly as-is (eager rebuild on every mutation).** Rejected: this is pure waste with no offsetting benefit — nothing reads the eagerly-rebuilt value before the next mutation invalidates it anyway, in the overwhelmingly common case of zero consumers. Paying a real, measurable cost (a full graph rebuild on every keystroke-triggered save, depending on debounce behavior) for a value nothing reads is the one part of the status quo with no defender.
- **Feature-flag the entire subsystem off until a consumer exists.** Rejected: a feature flag is more machinery than the problem needs — a lazy getter is a strictly smaller change that achieves the same "don't pay for it until it's used" outcome without introducing a flag system this codebase doesn't otherwise have.

## Consequences

- The moment a backlinks or embed-rendering feature is built, its data layer already exists and is already tested — the feature's implementation cost is UI-only.
- `Vault`'s "derived data is disposable" invariant (ARCHITECTURE_RULES.md rule 8) extends naturally to lazy projections: invalidate-then-rebuild-on-access is just as disposable as eager-rebuild-on-mutation, so this decision doesn't weaken that guarantee.
- Reviewers must resist the temptation to add more speculative projections under the cover of "it's lazy so it's free" — laziness reduces the CPU cost of speculation, it does not justify speculation. Coding Rule 4 (ARCHITECTURE_RULES.md / compliance checklist) still applies to any *new* projection.

## Why This Approach Is Preferred

It's the one decision in this document that isn't "pick a side" but "keep the asset, remove the cost" — the review found genuinely good engineering (correct, tested graph-resolution logic) attached to a genuinely bad default (run unconditionally, always). Separating those two findings and fixing only the second one is more precise than either keeping or discarding the whole subsystem would have been.
