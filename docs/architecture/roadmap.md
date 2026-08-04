# Architecture Roadmap

This is distinct from `backlog.md`. The backlog is *what* needs to happen, with per-item status; this roadmap is *when and in what order*, grouped into execution phases. Every phase gates the next — do not start a phase's work until its gate condition is met, even if a later phase's items look individually easy.

Each implementation branch (see `contributing.md`) should map to exactly one backlog item or one tightly-related group of items from a single phase — not span phases.

---

## Phase 0 — Architecture Governance

**Status: In Progress (this branch)**

Establish the documentation and governance structure this roadmap itself depends on: `docs/architecture/README.md`, `backlog.md`, `roadmap.md`, `contributing.md`, `implementation-log.md`, and the organized `investigation/` folder. No production code changes.

**Gate to Phase 1**: this branch (`architecture/governance-phase-1`) is merged. Only after that does any implementation branch open.

---

## Phase 1 — Critical Correctness

Fix confirmed, high-severity defects with trivial-to-small implementation cost and near-zero architectural risk. These are bugs, not architecture decisions — they don't require design discussion, only careful execution.

| Item | Title |
|---|---|
| ARCH-001 | Fix aliases frontmatter data-loss bug |
| ARCH-002 | Fix case-mismatched CSS imports and outlined-variant typo |
| ARCH-003 | Remove unguarded `console.log` calls in `useMenuKeyboard.ts` |
| ARCH-004 | Delete dead double-`var()` declarations in `theme.css` |
| ARCH-005 | Delete dead `editor.css` (pending the visual-feature check in its acceptance criteria) |
| ARCH-006 | Add `Workspace.test.ts` |

**Gate to Phase 2**: all Phase 1 items are `Done` and recorded in `implementation-log.md`. Phase 1 items may ship as independent PRs/branches in parallel — they have no interdependencies.

---

## Phase 2 — Architecture Compliance

Close confirmed rule violations and spec/code drift. This phase is about making the codebase agree with its own governing documents — either by fixing code to match the spec, or by amending the spec where the code's behavior is judged correct (per `implementation-rules.md`'s own "handling divergence" process).

| Item | Title |
|---|---|
| ARCH-021 | Stand up ESLint import-boundary enforcement |
| ARCH-007 | Close the Rule 10 (path-string confinement) violation — expanded scope |
| ARCH-008 | Reconcile `NavigationRouter` spec-vs-code drift |
| ARCH-009 | Amend two trivial spec/code type mismatches |
| ARCH-010 | Correct report 09's Rule 7 evidence wording |
| ARCH-011 | Correct report 11's `Vault` fan-out count and framing |

**Sequencing note**: ARCH-021 (ESLint) should land before or alongside ARCH-007 (Rule 10 migration) — standing up mechanical enforcement first means the Rule 10 migration's completeness can be verified by CI, not by manual re-grep, which is exactly the failure mode that let the original violation go undercounted.

**Gate to Phase 3**: ARCH-021 and ARCH-007 are `Done`. ARCH-008/009/010/011 (documentation/wording fixes) may land independently at any point and do not block the gate.

---

## Phase 3 — Simplification

Convergence and deletion work identified by `investigation/12-simplification-opportunities.md` and validated in `16-validation-report.md`. Lower urgency than Phases 1–2, but cheaper to do now than after further code accretes on top of the duplicated patterns.

| Item | Title |
|---|---|
| ARCH-014 | Converge the two independent by-path indexes |
| ARCH-015 | Resolve the sidebar read-access inconsistency (three-way, not two-way) |

**Gate to Phase 4**: not a hard gate — Phase 3 and Phase 4 may overlap, since neither blocks the other technically. Phase 3 is sequenced before Phase 4 here because it reduces the surface area Phase 4's product work would otherwise need to account for (e.g., a `Workspace` view-state extension is simpler to design against a codebase with one consistent read-access pattern, not three).

---

## Phase 4 — Product Evolution

Larger, product-facing work that requires a design/ADR before implementation, per `implementation-rules.md` §5's "would require inventing a new architecture" test where applicable.

| Item | Title |
|---|---|
| ARCH-012 | Fund the `Workspace` view-state extension |
| ARCH-016 | Close the Tags/Tasks/Search "looks done, isn't" UX gap |
| ARCH-017 | Decide the icon/emoji picker roadmap question |
| ARCH-018 | Decide the Trash/recoverable-delete priority question |
| ARCH-019 | Confirm whether the Notes/Daily-Notes overflow-menu asymmetry is intentional |
| ARCH-020 | Treat Plugins and Collaboration as "write the ADR first" roadmap items |

**Sequencing note**: ARCH-012 is the highest-leverage item in this phase — it is the shared architectural blocker for three separate future directions (Smart Collections, Virtual folders, a dedicated Pinned-pages view), per `investigation/10-product-architecture.md`. It should be scoped and funded as its own deliverable before any of those three is estimated individually, per that report's own recommendation.

**Gate to Phase 5**: none — Phase 5 (performance) is largely independent of product decisions and may proceed in parallel once Phase 2's compliance work is done.

---

## Phase 5 — Performance

Addressed after architectural findings are confirmed and compliance work (Phase 2) is underway, per `investigation/14-scalability.md`'s own framing: performance work should build on a codebase whose architectural shape is already settled, not one still being corrected underneath it.

| Item | Title |
|---|---|
| ARCH-013 | Add a parent-indexed map to `Vault`; establish the first performance benchmark |

**Gate to Phase 6**: none formally, but ARCH-013's benchmark fixture is a prerequisite for meaningfully measuring the effect of any future performance work — treat it as foundational for whatever performance work follows, not a one-off.

---

## Phase 6 — Long-Term Governance

Standing practices, not discrete backlog items. This phase never "completes" — it's the ongoing operating model this whole directory exists to establish.

- Re-run a validation pass (Phase 0-style) after any phase's work lands, scoped to what changed — per `investigation/16-validation-report.md`'s own closing note, a validation report has the same staleness risk as the investigation it validates.
- Periodically re-ask `implementation-rules.md` §6's "standing test for architectural health": for recently-shipped capabilities, is there exactly one file a new contributor would need to open to understand the whole thing, and exactly one write path underneath it?
- Any new architectural finding (from code review, incident, or ad hoc investigation) enters `backlog.md` following the same item structure as ARCH-001 through ARCH-021, not as an unstructured note elsewhere.
- ADRs required for major decisions continue to live in `docs/adr/`, cross-referenced from the relevant backlog item.

---

## Phase Summary

| Phase | Focus | Blocking gate |
|---|---|---|
| 0 | Architecture governance | This branch merges |
| 1 | Critical correctness | All items `Done` |
| 2 | Architecture compliance | ESLint + Rule 10 migration `Done` |
| 3 | Simplification | None (soft-sequenced before Phase 4) |
| 4 | Product evolution | None (parallel to Phase 5) |
| 5 | Performance | None (benchmark is foundational, not blocking) |
| 6 | Long-term governance | Never completes — standing practice |
