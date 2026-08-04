# Clutter Architecture Governance

This directory is the entry point for all architecture-review work on Clutter: the investigation that was done, how it was validated, and how findings become implementation work. It sits alongside — and does not replace — the existing frozen-architecture documents at the repo root and in `docs/` (`ARCHITECTURE_RULES.md`, `docs/architecture-specification.md`, `docs/implementation-rules.md`, `docs/adr/`). Those documents remain the source of truth for *what the architecture is*. This directory governs *how we find, validate, and act on* deviations from it.

## Why This Investigation Exists

Clutter's architecture is unusually well-documented for a project this size — a frozen specification, twelve named and individually-enforced rules, an ADR trail, and a durability vocabulary. That documentation makes strong claims about the codebase's own compliance with itself. Those claims had never been independently audited end-to-end. This investigation exists to answer, with direct evidence rather than inference: is the code actually what the documents say it is, where has it drifted, and what should be done about the drift.

## How to Read This Directory

Three layers, in order:

1. **`investigation/`** — the original findings. Sixteen reports (`00` through `15`) covering every layer of the app from design tokens up through product architecture, plus one validation report (`16`) that re-verifies the first fifteen against live source. Read `investigation/00-overview.md` first, then `investigation/16-validation-report.md` — the validation report is authoritative over anything it corrects in reports `00`–`15`. Treat reports `01`–`15` as the detailed evidence base, not as the final word on any given finding without checking whether `16` touched it.
2. **`backlog.md`** — every validated finding turned into a discrete, tracked work item, with status, priority, complexity, risk, and acceptance criteria. This is the single source of truth for "what needs to happen." It supersedes the tier lists inside `investigation/15-final-recommendations.md` and `investigation/16-validation-report.md`'s own "Updated Architecture Backlog" section — those remain as historical record of how the priorities were derived, but `backlog.md` is what gets worked from.
3. **`roadmap.md`** — how backlog items are sequenced into execution phases. Distinct from the backlog: the backlog is *what*, the roadmap is *when and in what order*.

`contributing.md` governs how this directory itself stays current as work proceeds, and `implementation-log.md` is the running record of what has actually been done, filled in as backlog items complete.

## Report Order and Structure

| Report | Covers |
|---|---|
| `00-overview.md` | Entry point, module map, "what a new contributor must understand first" |
| `01-design-tokens.md` | Token system: primitives, semantic aliases, theming |
| `02-icons.md` | Icon registry, emoji support, icon-as-data ownership |
| `03-design-system.md` | Component primitives (Button, Entry, Checkbox, Menu, Overlay, etc.) |
| `04-components.md` | Composite components (Sidebar, page chrome, Search) |
| `05-ux-behaviors.md` | Runtime behavior comparison: Notes vs. Daily Notes vs. Tags vs. Tasks |
| `06-navigation.md` | `NavigationRouter`, `Workspace`, hooks, breadcrumbs |
| `07-data-model.md` | Page/Folder shape, frontmatter, identity, persistence, projections |
| `08-feature-architecture.md` | `features/` boundary audit; Favorites/Templates/Archive/Trash/Assets inventory |
| `09-application-architecture.md` | Full 12-rule compliance audit of the application layer |
| `10-product-architecture.md` | Forward-looking fit assessment for future product directions |
| `11-dependency-graph.md` | Full fan-out map of core shared objects and navigation-adjacent concepts |
| `12-simplification-opportunities.md` | Synthesis: convergence/deletion candidates, tiered by leverage |
| `13-performance.md` | Synthesis: the one root performance shape, traced across the stack |
| `14-scalability.md` | Synthesis: data scalability vs. product/governance scalability |
| `15-final-recommendations.md` | Synthesis: the original prioritized action list |
| `16-validation-report.md` | Phase 0 validation — skeptical re-verification of `00`–`15` against live source |

## Investigation Methodology

The investigation was run as parallel, independently-briefed research passes, each grounded in the existing frozen-architecture documents (`ARCHITECTURE_RULES.md`, `docs/architecture-specification.md`, `docs/implementation-rules.md`) so findings could be stated in the codebase's own vocabulary rather than an external framework. Every claim was required to be labeled with a confidence level — **Verified**, **Strong Evidence**, **Likely**, **Hypothesis**, or **Unknown** — and backed by a `file:line` citation wherever it was a claim about code, not opinion. Reports `01`–`11` are the direct investigation; `12`–`15` are synthesis reports written after reading `00`–`11` in full, consolidating cross-cutting findings (simplification, performance, scalability) and producing the final prioritized recommendation list.

## Validation Methodology

Investigation findings are not implementation-ready on their own. `16-validation-report.md` is a distinct Phase 0 activity, run after the investigation and before any implementation: every significant finding was re-derived from the current source tree independently, without trusting the original reports' citations, and classified as one of ✅ Confirmed, ⚠️ Partially Confirmed, ❌ Not Reproducible, 🔄 Already Fixed, or 🤔 Needs More Investigation. Validation was run in four passes ordered by impact (critical findings first, then dependency/simplification/navigation, then design-system/UX, then performance/scalability), each explicitly briefed to catch staleness or overstatement rather than confirm what was already written. The result: no finding was withdrawn, but several were strengthened, corrected, or resolved from a prior "Unknown" — see `16-validation-report.md`'s "Changes to Investigation" section for the full account. **Validation precedes implementation** — see `contributing.md`.

## Current State

This branch (`architecture/governance-phase-1`) establishes the governance framework only. No production code has been changed as part of this branch or as part of the investigation/validation work itself — see `contributing.md` for the standing rule this branch exists to put in place. Implementation work begins on separate branches, one per backlog item or tightly-related group, only after this governance structure is in place and this branch has merged.
