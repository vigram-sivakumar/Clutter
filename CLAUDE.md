# Clutter — Instructions for Claude

## Architecture governance

Clutter's architecture is frozen. Before doing any architectural implementation work — adding a capability, modifying a subsystem's public API, touching persistence/write paths, or restructuring folders/services — read these in order:

1. `docs/implementation-rules.md` — **read this first, every time.** It defines the process: the pre-implementation checklist, the engineering rules to follow while coding, the post-implementation review/verification checklists, when to stop and escalate instead of improvising, and how to report any divergence from the spec.
2. `docs/architecture-specification.md` — the frozen contracts (public APIs, invariants, lifecycle, concurrency model) for every subsystem. This is the source of truth for "what is the code supposed to do."
3. `ARCHITECTURE_RULES.md` — the small set of immutable rules (one owner per capability, one write path through the Persistence Gate, dependencies point downward, etc.), each with its enforcement mechanism and regression signature.
4. `docs/architecture-compliance-checklist.md` — the Yes/No PR checklist derived from the rules above.
5. `docs/adr/` — decision records explaining *why* each major architectural choice was made over its alternatives. Consult before questioning or trying to change a settled decision.
6. `docs/architecture-target.md` and `docs/architecture-assessment.md` — rationale and history: what the target architecture looks like and why, and the original independent audit that motivated it.
7. `docs/durability-model.md` — the vocabulary for what "saved" actually guarantees, stage by stage (Committed / Durable / Reconciled) and what's explicitly out of scope today (undo/version history, cloud sync, atomic writes). Consult before any work touching persistence, autosave cadence, crash recovery, or sync — state which stage a change affects, using this document's terms, rather than re-deriving what "saved" means.

**Operational contract for any implementation task touching the architecture** (from `docs/implementation-rules.md`):
1. Read `docs/implementation-rules.md`.
2. Read the relevant sections of `docs/architecture-specification.md` (and target/assessment docs if rationale is unclear).
3. State explicitly which rules/checklist items apply to the requested work before writing code.
4. Implement only within those rules — treat any needed exception as a reason to stop and escalate (per the Failure Conditions section), not a judgment call to make silently.
5. Run the post-implementation verification steps before considering the task done.
6. Report any divergence from the specification explicitly, rather than letting it merge silently.

Skip this process only for work that is clearly non-architectural (styling, copy changes, isolated bug fixes with no ownership/write-path/dependency implications).

## Git commit workflow (permanent)

Every logically complete implementation milestone must be verified and committed before moving to the next one:

1. Run the relevant verification (`tsc`, targeted tests, or the full suite, as appropriate for what changed).
2. Report the verification results.
3. If verification passes, create a Git commit with a clear, descriptive message.
4. Report the commit hash and message before starting the next milestone.

Do not accumulate multiple completed milestones into one uncommitted change unless explicitly told to. If verification fails, do not commit — explain the failure first and fix it before proceeding.
