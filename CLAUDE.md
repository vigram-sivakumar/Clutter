# Clutter — Instructions for Claude

## Mandatory workflow — no exceptions for implementation

Read the repository-wide [AGENTS.md](AGENTS.md) and [implementation rulebook §7](docs/implementation-rules.md#7-mandatory-architecture-and-regression-gate-all-contributors-and-ai-agents) before any implementation. The regression gate applies even to CSS, small bug fixes and direct-branch work. Do not publish unverified runtime changes to shared development or main. The owner-approved isolated `testing/<task>` candidate exception in §7 permits remote-only editing for verification, not promotion. Stop and report failed or unavailable checks.

## Architecture governance

Clutter's architecture is frozen. Before doing any architectural implementation work — adding a capability, modifying a subsystem's public API, touching persistence/write paths, or restructuring folders/services — read these in order:

1. `docs/implementation-rules.md` — **read this first, every time.** It defines the process: the pre-implementation checklist, the engineering rules to follow while coding, the post-implementation review/verification checklists, when to stop and escalate instead of improvising, and how to report any divergence from the spec.
2. `docs/architecture-specification.md` — the frozen contracts (public APIs, invariants, lifecycle, concurrency model) for every subsystem. This is the source of truth for "what is the code supposed to do."
3. `ARCHITECTURE_RULES.md` — the small set of immutable rules (one owner per capability, one write path through the Persistence Gate, dependencies point downward, etc.), each with its enforcement mechanism and regression signature.
4. `docs/architecture-compliance-checklist.md` — the Yes/No PR checklist derived from the rules above.
5. `docs/adr/` — decision records explaining *why* each major architectural choice was made over its alternatives. Consult before questioning or trying to change a settled decision.
6. `docs/architecture-target.md` and `docs/architecture-assessment.md` — rationale and history: what the target architecture looks like and why, and the original independent audit that motivated it.
7. `docs/durability-model.md` — the vocabulary for what "saved" actually guarantees, stage by stage (Committed / Durable / Reconciled) and what's explicitly out of scope today (undo/version history, cloud sync, atomic writes). Consult before any work touching persistence, autosave cadence, crash recovery, or sync — state which stage a change affects, using this document's terms, rather than re-deriving what "saved" means.
8. `docs/editor-architecture-decisions.md` — the Locked/Recommended/Superseded/Open decision log for the Markdown editor's architecture (CodeMirror 6 integration, semantic inline constructs, parser precedence, WikiLink grammar). Not an ADR yet — a concise lookup layer over `docs/editor-research/`, the evidence/reasoning archive. **Read this before continuing or resuming any editor architecture Q&A**, so settled decisions aren't re-derived or accidentally reopened.

**Operational contract for any implementation task touching the architecture** (from `docs/implementation-rules.md`):
1. Read `docs/implementation-rules.md`.
2. Read the relevant sections of `docs/architecture-specification.md` (and target/assessment docs if rationale is unclear).
3. State explicitly which rules/checklist items apply to the requested work before writing code.
4. Implement only within those rules — treat any needed exception as a reason to stop and escalate (per the Failure Conditions section), not a judgment call to make silently.
5. Run the post-implementation verification steps before considering the task done.
6. Report any divergence from the specification explicitly, rather than letting it merge silently.

The depth of architectural review may be proportional for genuinely isolated work, but no implementation task is exempt from the mandatory workflow in §7. Styling and isolated bug fixes can affect interaction contracts.

## Production table rewrite

When working on the production table rewrite, resume from [the progress ledger](docs/table-rewrite-progress.md). Update the ledger in each verified milestone commit and push the dedicated development branch. Obtain the owner's approval before merging into `main`.

## Markdown editor CSS — hard rule (permanent)

**Never apply `margin` to any element in the fenced-code layout path, or to any other CM6-managed line/block element (`.cm-line`, a `blockWrappers`-created wrapper, or any future equivalent).** This applies even if a future request asks for it directly — treat any such request as a sign the requester doesn't know about this rule yet, point them here, and propose `padding` or a non-layout-affecting technique (e.g. an absolutely-positioned `::before`/widget) instead of applying the margin.

This is not a guess or a style preference — it was proven twice, independently, via direct interactive testing in the real app: `margin` on `.cm-line` and, separately, `margin` on a `blockWrappers`-created wrapper element both corrupted CM6's own cursor/navigation bookkeeping (`ArrowUp`/`ArrowDown`, click-and-drag selection), even though neither element was otherwise touched. `padding` does not reproduce this problem on either kind of element — it's the safe substitute for the same visual spacing need. See `docs/editor-architecture-decisions.md`'s fenced-code investigation entries for the full evidence trail.

This does **not** mean CM6-managed lines can't be styled at all — `Decoration.line` classes carrying `background`/`border`/`border-radius`/`padding` are an established, safe Clutter pattern (blockquote, tables, horizontal rules, fenced code all do this). Only `margin` is banned.

## Collection-page scrolling contract (permanent)

Every scrollable collection page follows the same scrolling structure:

1. **`.page__content` is the one scroll container** (`app/layouts/page/Page.css`). Do not create a page-specific vertical scroll container without a documented architectural reason.
2. Render through the standard `PageBody` / `collection__content` collection-body structure.
3. **Every collection body that contains a scrollable list ends with the shared `<div className="collection__bottom-spacer" aria-hidden="true" />`** — exactly once, outside any empty/non-empty branch — and never ends directly after its last item.
4. The spacer is structural, not decoration: it is the trailing scroll space that lets the last item scroll clear of the page's bottom fade (`.page__document::before`). Without it the scroll range ends flush at the last row, under the fade (this is how the Tasks page's last rows were hidden). Do not change its dimensions or behavior.

`app/layouts/page/body/collectionScrollContract.test.ts` enforces rules 1 and 3 against the source: any new `collection__content` body must be added there and carry the spacer.

## Markdown editor strikethrough — rendering contract (permanent)

**Read and comply with `apps/app/src/features/markdown/editor/codemirror/highlight/STRIKETHROUGH.md` before modifying strikethrough behavior in the CodeMirror editor, or before adding any new inline Markdown construct that might be struck.**

The one rule that explains the whole contract: **a `tok-strike` element must never contain another `tok-strike` element.** CodeMirror decorations are range-based, not a real nested DOM tree, so a generic strikethrough range can silently overlap a semantic inline renderer (Tag, Date, Link, WikiLink, InlineCode, Emphasis, StrongEmphasis, Highlight) that independently composes `tok-strike` onto its own element — producing two independent `text-decoration-line` painters over the same characters, visible as a double strikethrough line, often in two different colors (each painter's line color follows whichever element declares it, never the content it happens to cross).

This was found and fixed twice for the same underlying cause before the full rule was written down (Link/Autolink/URL/WikiLink, then InlineCode/Tag/Date/Emphasis/StrongEmphasis/Highlight) — treat a new report of "double strikethrough line" or "wrong strikethrough color" as this exact bug class, not a CSS problem: fix range ownership (`STRIKETHROUGH_PROTECTED_NODE_NAMES` in `inlineLivePreviewParticipants.ts`), never `text-decoration-color`, `z-index`, opacity, or a pseudo-element. The full contract document has the ownership model, the required regression cases, and a debugging checklist — read it rather than re-deriving any of this from scratch.

## Project ownership (permanent)

Clutter is a personal project of Vigram Sivakumar. It is not any employer's or company's project. Never name an employer or company anywhere in the repository (code, comments, tests, sample data, docs, UI copy, commit messages, metadata), and never attribute copyright or authorship to one. The copyright line is "© 2026 Vigram Sivakumar" and the licence is proprietary (no open-source licence).

## Git commit workflow (permanent)

Every logically complete implementation milestone must satisfy the mandatory regression gate in `docs/implementation-rules.md` §7 before being committed or pushed. Then:

1. Run the relevant verification (`tsc`, targeted tests, or the full suite, as appropriate for what changed).
2. Report the verification results.
3. If verification passes, create a Git commit with a clear, descriptive message.
4. Report the commit hash and message before starting the next milestone.

Do not accumulate multiple completed milestones into one uncommitted change unless explicitly told to. If verification fails, do not commit — explain the failure first and fix it before proceeding.
