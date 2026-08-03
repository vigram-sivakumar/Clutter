# 14 — Scalability Analysis

Synthesis report. Distinguishes two independent axes the source reports (01–11) repeatedly conflate under "scalability": **data scalability** (does the architecture hold up as one vault grows to many pages) and **product/surface scalability** (does the architecture hold up as the number of features, contributors, and product directions grows). Both are real and separately evidenced; they have different root causes and different fixes.

## Summary

**Data scalability** is bounded by exactly the same root cause as report 13's performance findings — no indexed-by-parent structure — and is explicitly, deliberately deferred by the codebase itself ("this is a correctness-over-performance choice that stays, given current file counts," `Vault.ts:198`). This is a known, named, low-urgency risk with a clear fix.

**Product/surface scalability** is a more interesting and more consequential finding: the codebase's *governance* (rules, facades, ownership model) scales cleanly to more features of the same shape, and the reports find no evidence of the "six-way fragmentation" the architecture was rebuilt to prevent recurring. But **one specific subsystem — `Workspace`'s view-state model — is a single point of constraint for a disproportionate share of the product's next several roadmap directions** (report 10), which is a scalability finding of a different, more architectural kind than "will this be slow."

## Data Scalability

Fully covered in report 13; summarized here for completeness:

- No parent-indexed or filter-indexed structure exists anywhere in `Vault`/`VaultQuery` — every read is O(n) over the whole vault (Report 07).
- Every mutation triggers a full projection rebuild (`tagsByName`/`taskList`), not an incremental update (Report 07).
- The explicitly-stated design point is "hundreds" of pages; nothing breaks correctness above that, but latency is untested and unbounded by design (Report 07, 13).
- **This is the easy half of scalability** — the fix (a parent-indexed map, still fully rebuildable per Rule 8) is narrow, well-understood, and doesn't require any architectural rework, only an additive index.

## Feature/Governance Scalability — the Good News

Every report that assessed this axis found the same thing: **the architecture's own rules (`ARCHITECTURE_RULES.md`) scale correctly to new features of the shape the codebase already has.**

- Report 09's full 12-rule compliance audit found 11 of 12 rules passing with direct grep evidence, across a codebase that has already grown well past its original migration scope (autosave/draft lifecycle, ADR-017/018/019, were added *after* the spec froze and still comply).
- Report 08 found "no reach-around violations" anywhere in `features/` — every production file importing Vault/application types does so `import type` only, and the Favorites feature (report 08, 10) demonstrates the intended low-risk extension shape working exactly as designed: one new metadata field, one existing `updateMetadata` call, zero new subsystems.
- Report 11 found the dependency graph is a genuine DAG with zero upward-import violations found across the whole grep sweep — the "how much do I need to understand to change X" test (`implementation-rules.md` §6) passes.
- The `topBarActionsRegistry` pattern (report 04) is a real, working example of a declarative extension point already in place for page-type-specific chrome — a template for how a third page type (Templates, Attachments) would slot in.

**This means the architecture genuinely achieves its own stated goal** ("Why This Stays Coherent After 300 More Features," `architecture-specification.md`) for the class of feature it was designed around: a new verb on an existing aggregate, or a new aggregate following the `*Operations` facade shape.

## Feature/Governance Scalability — the Constraint

The one rule violation found (Rule 10, path semantics — reports 07, 09, 11) is itself evidence of *how* scalability erodes in this codebase when it does: not through a missing rule, but through a rule that exists, is understood, and is enforced by code review rather than tooling — and therefore drifts unnoticed in exactly the files that predate the rule's full application (`MoveService`, `VaultSyncService`, `DailyNoteService`). This is a **process** scalability risk, not an architecture one: nothing about the rule design failed, but "code-review checkpoint, not lint-enforced" (the rule's own stated enforcement mechanism) is a scaling bottleneck as contributor count grows and reviewer attention is finite. The same risk applies to every other rule marked "code-review checkpoint" rather than lint-enforced, and to the design-token/component layers, which have **no enforcement mechanism at all** (report 01, 03) — the two build-breaking bugs and the dead-token issues found in a single manual audit pass are exactly the class of defect automated tooling exists to catch, and their presence is itself evidence the review process alone isn't catching them at the current pace.

## The `Workspace` Constraint — the Most Consequential Finding in This Report

Report 10 traces, with direct ADR citation, the single most load-bearing scalability fact in the entire codebase: `Workspace` has exactly two mutually-exclusive scalar fields (`activePageId`, `activeFolderId`) and no concept of a filtered/virtual "view." ADR-014 Decision 4 already designed six view-level navigation intents (`openFavorites`, `openAllNotes`, `openAllTasks`, `openSomedayTasks`, `openCompletedTasks`, `openAllTags`), found they required a `Workspace` extension that doesn't exist, and **deleted the plan rather than half-build it** — a genuinely disciplined choice, but one that leaves a specific, named gap.

That single gap is the shared blocker for three separate future product directions (Smart Collections, Virtual folders, a dedicated Pinned-pages destination — report 10's Hidden Coupling section), meaning a roadmap that schedules them as three independent backlog items risks solving the same underlying architectural problem three times, or once but sized for whichever ships first. This is the clearest example in the whole investigation of **product scalability being gated by one subsystem's current shape** — not a performance ceiling, a structural one.

By contrast, Cloud Sync and Version History (report 10) are the best-prepared directions precisely because the architecture already did the scalability-relevant prep work ahead of need — `VaultPath` confinement (ADR-007) and immutable `DocumentRevision`s (ADR-018) are both real, cited investments that make those specific future extensions cheaper, in direct contrast to `Workspace`'s view-state gap or Plugins' total absence of any placeholder.

## Scalability Risks by Product Direction (from report 10, restated here as a scalability-specific summary)

| Direction | Scalability verdict | Root constraint |
|---|---|---|
| Smart Collections / Virtual folders / dedicated Pinned view | Blocked on one shared gap | `Workspace` has no filtered-view state (ADR-014) |
| Workspaces (multi-vault) / Multiple windows | Requires new top-level concern | `Application`/`Vault`/`Workspace` are process-singletons by construction (Rule 11) |
| Collaboration | Requires rework of the core concurrency model | Persistence Gate's per-page serialized queue assumes exactly one writer (Rules 2/3) |
| Cloud Sync | Additive, well-scoped | `VaultPath` confinement already done; `Sync`'s Reconciled stage is explicitly distinguished from a future Cloud-synced stage |
| Version History | Additive, well-scoped | Immutable `DocumentRevision`s already exist; only retention + a Gate persistence path are missing |
| Plugins | No placeholder exists at all | Not named anywhere in the twelve-subsystem list — starts from zero |

## Recommendations

1. **Treat the `Workspace` view-state extension as its own scoped phase, funded before any of Smart Collections/Virtual folders/Pinned-view is estimated individually** — this is report 10's own top recommendation and the single highest-leverage scalability fix available for the product-direction axis.
2. **Move Rule 10 (and, longer-term, Rules 2/3/6) from code-review-only to lint-enforced**, per the rule's own stated "target mechanical enforcement" — the Rule 10 violation is a direct, present-tense demonstration of what happens when enforcement is convention-only as the codebase scales.
3. **Add the minimal design-token/component lint pass** (report 01, 03's recommendation) for the same reason — this is a governance-scalability fix, not a data-scalability one, but it belongs on the same list because both are about enforcement keeping pace with growth.
4. **Add the parent-indexed map** (report 13's top recommendation) before vault size becomes a live complaint, since it's cheap now and expensive to retrofit under pressure later.
5. **Treat Plugins and Collaboration explicitly as "write the ADR first" roadmap items**, not estimated features — per `implementation-rules.md` §5's own failure-condition language, both require inventing new architecture, and no scalability claim in this report should be read as sizing either.

## Confidence Level

- **Verified**: the `Workspace` view-state gap and its ADR-014 documentation, the Rule 10 violation and its file:line evidence, the 11/12 rule-compliance result, the DAG/no-upward-import finding.
- **Strong Evidence**: that the Rule 10 violation is a direct consequence of convention-only enforcement (reasoned from the rule's own stated enforcement mechanism plus the observed drift).
- **Hypothesis**: the actual latency/lag threshold at which data-scalability issues become user-visible — not measured (see report 13).

## Next Investigation Areas

- Whether any ESLint boundary configuration referenced throughout `ARCHITECTURE_RULES.md` as "the target mechanical enforcement" is actually present in this repo's lint config — flagged as unconfirmed by reports 08, 09, and 10 independently; this is the single fastest fact to check and would materially change this report's risk assessment of the enforcement-scalability question if the tooling turns out to already exist.
