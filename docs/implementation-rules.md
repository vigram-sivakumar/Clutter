# Clutter — Implementation Rulebook

This document governs **how** architecture changes are implemented, not what the architecture is. The architecture itself is frozen in `docs/architecture-specification.md`, motivated by `docs/architecture-target.md`, and justified against evidence in `docs/architecture-assessment.md`. `ARCHITECTURE_RULES.md` and `docs/architecture-compliance-checklist.md` state *what* must be true of the code; this document states *how implementation work must proceed* so that what's true of the code stays true after every change.

Every rule below traces back to one of the three source documents. None of them are new architectural opinions — where this document says "never X," the assessment already found X caused a problem, the target document already decided against X, or the specification already defines a contract X would violate.

**This document is read twice per task: before starting (§1–2) and after finishing (§3–4), with §5–6 as standing background at all times.**

---

## 1. Pre-Implementation Checklist

Complete every item before writing any code. If an item can't be answered, that is itself a signal — see §5 (Failure Conditions).

- [ ] **Which migration phase does this work belong to?** Name the phase from `docs/architecture-target.md`'s migration plan (Phase 1–6), or state explicitly that this is post-migration feature work built on the completed target architecture. Work that doesn't map to any phase and isn't post-migration feature work is out of sequence — resolve this before continuing (see §5).
- [ ] **Which subsystems are affected?** List every subsystem from the specification's twelve (Platform, Vault Ingest, Vault Domain Model, Sync, Persistence Gate, `PageOperations`, `FolderOperations`, Navigation Router, `DocumentEditing`, `Workspace`, Composition Root, UI/Features) that this change touches, directly or by dependency.
- [ ] **Which public APIs are involved?** For each affected subsystem, cite the exact method signatures from §-numbered sections of `architecture-specification.md` that are being called, extended, or implemented. If a method doesn't yet exist in the spec, that's a specification gap, not something to improvise around (see §5).
- [ ] **Which ownership rules apply?** Identify the specific rule(s) in `ARCHITECTURE_RULES.md` (numbered 1–12) that bound this work — at minimum, confirm which single facade/subsystem owns the capability being touched.
- [ ] **Which invariants must remain true?** List the specific invariants (from the affected subsystems' "Invariants" sections in the specification) that this change must not violate. Write them down explicitly, not just "the usual ones" — an invariant that isn't named is one that won't be checked.
- [ ] **Which existing implementation is being replaced?** Name the specific file(s)/method(s) being retired, per the target document's migration plan, and confirm their existing test coverage will carry over (per the target plan's stated approach of migrating tests alongside logic, not discarding them).
- [ ] **Which existing implementation must remain untouched?** Explicitly name adjacent subsystems the target document marks "leave alone" or "unchanged" for this phase (e.g., `DocumentEditing` internals per ADR-010, the knowledge-graph builders' internal logic per ADR-004) so they aren't opportunistically refactored as a side effect.
- [ ] **Does this work require changes to the specification?** If the requested work cannot be expressed within the current contracts in `architecture-specification.md`, stop and produce a specification amendment (a new or superseding ADR) before writing implementation code — do not let the implementation silently become the new de facto specification (see §5, "specification is internally inconsistent" and §4, "handling divergence").
- [ ] **Is there already an approved abstraction that should be extended instead of creating a new one?** Check the capability map and subsystem list for an existing facade method, `PersistenceOperation` kind, or extractor/builder shape that already covers this need. A new abstraction is only justified when none of the existing ones can be extended to cover it (see §2, "new abstractions require justification," and §6, "when a new subsystem is justified").
- [ ] **What is the smallest correct change?** State explicitly what will *not* be touched. This is not a formality — the assessment's central finding was that small features kept expanding into large, uncoordinated changes; naming the boundary up front is what keeps that from recurring.

---

## 2. Implementation Rules

These are the engineering rules followed while writing code, derived directly from the specification's invariants and the assessment's findings about what went wrong without them.

1. **Never write to disk or mutate `Vault` from outside the Persistence Gate or Sync.** (Spec §5, §3; Assessment's finding of three uncoordinated write paths; `ARCHITECTURE_RULES.md` rules 2–3.) If a task seems to require a new write call site, the correct action is adding a `PersistenceOperation` kind to the Gate, never a direct `fileSystem`/`Vault` call elsewhere.
2. **Never give a capability a second owner.** (Spec §6–7; `ARCHITECTURE_RULES.md` rule 1.) Before adding a new method for "create," "save," "delete," "move," "rename," "archive," or "restore" anywhere other than `PageOperations`/`FolderOperations`, confirm the facade doesn't already own this capability under a different name.
3. **Never add a facade method whose entire body is an unconditional forward.** (Spec §8, "Note what is absent"; `ARCHITECTURE_RULES.md` rule 9.) If the new method would just call another method with no added validation, decision, or side effect, the caller should hold a reference to that other method directly instead.
4. **Never duplicate a business rule across files.** (`ARCHITECTURE_RULES.md` rule 5; Assessment's finding of duplicated grouping/page-model logic.) Draft-promotion, collision-free naming, path computation, and similar decisions each have exactly one implementation (`shouldPromoteDraft`, `PagePathResolver`, `MoveService`, respectively) — extend that implementation, never reimplement its logic nearby "because it's easier than importing it."
5. **Never move a responsibility across a subsystem boundary as a side effect of an unrelated change.** (Spec's per-subsystem "must never own" sections; `ARCHITECTURE_RULES.md` rule 7.) If implementing capability A reveals that capability B's logic is misplaced, that is a separate, explicitly scoped task — not a drive-by fix bundled into A's PR.
6. **Never introduce a new abstraction (service, coordinator, builder, facade) without citing which existing one it replaces or which specification gap it closes.** (Assessment's speculative-abstraction findings; `ARCHITECTURE_RULES.md` rule 1 and the compliance checklist's Migration Rules.) "This felt cleaner as its own class" is not sufficient justification; "the specification has no home for this and here is the ADR proposing one" is.
7. **Preserve every public contract listed in `architecture-specification.md` unless the specification itself is amended first.** (Spec's framing as "the contract implementers build against.") A method signature, invariant, or lifecycle description in the frozen spec is not renegotiable mid-implementation — if it turns out to be wrong, that's a specification-amendment conversation (§4), not a quiet signature change.
8. **Never leave a capability half-migrated across two write paths.** (`ARCHITECTURE_RULES.md` rule 12.) If a PR moves a capability's UI entry point to the new facade but the facade still writes around the Gate (or vice versa), the capability is not done — ship both halves together or not at all.
9. **Never manipulate path strings outside `vault/path/` and `platform/`.** (Target document §11; `ARCHITECTURE_RULES.md` rule 10.) Any new code that needs a parent directory, a filename, or a folder-membership check calls the `VaultPath` helper, even if inlining feels like less code for this one call site.
10. **Never construct a long-lived subsystem instance outside the Composition Root.** (Spec §11; `ARCHITECTURE_RULES.md` rule 11.) If a new object needs to be shared across multiple consumers, it is wired in `Application.ts`'s `bootstrap()`/`attachVault()`, not instantiated where it's first needed.
11. **Never let UI code import a concrete application-layer or vault-layer class.** (Spec §12; `ARCHITECTURE_RULES.md` rule 6.) Components receive facades and query objects as props; a new component reaching for `new VaultQuery(vault)` or importing `PageOperations` directly is a boundary violation regardless of how small the usage.
12. **Never leave a stub wired to a live UI control.** (Assessment's finding of shortcut handlers throwing at runtime.) A method that isn't implemented yet must not be reachable from a button, menu item, or shortcut a user can actually trigger — either implement it, or disable/remove the control until it is.
13. **Never treat "it's lazy" or "it's disposable" as license to add new unconsumed machinery.** (ADR-004's explicit caveat.) Lazy evaluation and full-rebuild-from-source are properties that make *existing* speculative work cheap to retain — they are not a justification for building new speculative projections, extractors, or indexes without a shipped consumer.
14. **When in doubt, add a method to an existing facade before adding a file.** (Target document §6, Coding Rule 1.) The default answer to "where does this go" should almost always be resolvable by reading the twelve-subsystem list in the specification; reaching for a new top-level file is the exception, not the default.

---

## 3. Code Review Checklist

Run after implementation, before merge. Every item is objectively verifiable against the specification, the target document's migration plan, or the code itself — not a matter of opinion.

- [ ] **Did ownership remain unchanged for every capability not in scope for this task?** (Verify against the capability map in `architecture-target.md`.)
- [ ] **Does the capability this task targets now have exactly one owner and exactly one write path?** (`ARCHITECTURE_RULES.md` rule 12 — check both halves: facade method and Gate operation.)
- [ ] **Were all invariants named in the Pre-Implementation Checklist actually preserved?** (Check each one named against the diff, not just against intuition.)
- [ ] **Were dependency directions preserved — no new import points upward per the dependency diagram?** (Compare new import statements against `architecture-target.md`'s dependency diagram.)
- [ ] **Were architectural boundaries respected — no direct `VaultFileSystem` write call, no direct `Vault` mutation, outside their approved owners?** (Grep the diff for `writeFile`/`deleteFile`/`moveFile`/`addPage`/`replacePage`/`removePage`/`updatePagePath`/`moveFolder` call sites.)
- [ ] **Was a new abstraction introduced, and if so, is it accompanied by a citation of the specification gap or ADR that justifies it?**
- [ ] **Was unnecessary complexity introduced** — a new layer, wrapper, or forwarding method not required by the task's stated scope?
- [ ] **Was dead code produced by this change actually removed** (the retired file/method, not left alongside its replacement "just in case")?
- [ ] **Was duplicate logic eliminated rather than added to** — did this change extend an existing implementation (`PagePathResolver`, `shouldPromoteDraft`, `MoveService`, etc.) instead of writing a parallel version?
- [ ] **Is the implementation consistent with the exact method signatures and types in `architecture-specification.md`,** or does it silently diverge (extra parameters, different return shape, different error behavior)?
- [ ] **Does every write path exercised by this change go through the Persistence Gate's queue**, verified by tracing the actual call chain, not by assuming the facade "must" call it?
- [ ] **Were tests added or migrated for every new/changed public method**, per the specification's per-subsystem testing strategy?
- [ ] **Is any UI control wired to a method that isn't fully implemented?**
- [ ] **Does the Composition Root construct every touched subsystem exactly once**, with no new duplicate instantiation introduced?
- [ ] **If this PR is part of a migration phase, does it leave that phase either fully complete or explicitly, visibly incomplete (tracked issue), never silently half-done with both old and new patterns live for the same capability?**

---

## 4. Post-Implementation Verification

Run this sequence after the code review checklist passes and before considering the task complete.

### Architectural verification
Re-read the specific subsystem section(s) of `architecture-specification.md` touched by this change and confirm the implemented code matches — public API shape, lifecycle, and ownership — line for line where the spec gives an exact signature.

### Dependency verification
Diff the new/changed import statements against the dependency diagram in `docs/architecture-target.md`. Any import crossing a layer boundary in the disallowed direction fails verification immediately, regardless of how "obviously fine" it seems for this one case.

### Ownership verification
For the capability this task targeted, confirm there is exactly one file implementing it and exactly one operation kind in the Persistence Gate backing it. For every other capability, confirm nothing changed about who owns it.

### Concurrency verification
If this task touched the Persistence Gate or added a new `PersistenceOperation` kind, run (or write, if missing) a test that enqueues two operations for the same page id and confirms they resolve in enqueue order. If this task touched `Vault` mutation methods, run (or write) a test confirming id/path map consistency after the mutation. Skipping this step is only acceptable if the task provably added no new concurrent-write surface — state why, explicitly, if skipping.

### Public API verification
Confirm every new/changed method matches its specification signature exactly (parameter types, return type, error behavior). If it doesn't match, this is a divergence — handle per the process below, don't let it merge silently.

### Invariant verification
Re-check every invariant named in the Pre-Implementation Checklist against the final diff, not the plan — implementation often reveals an invariant needs a different guard than originally expected. Confirm the actual guard is present, not just the intent.

### Regression verification
Run the full existing test suite for every subsystem touched, not just new tests for the new code. Confirm the specific tests that covered the retired implementation (if this task replaced one, per §1) still exercise equivalent behavior against the new implementation, rather than having been deleted along with the old code.

### Handling divergence from the specification

If verification reveals the implementation had to diverge from `architecture-specification.md` to be correct or buildable:

1. **Stop before merging.** A divergence that ships silently is exactly how the pre-migration architecture drifted (per the assessment's evolution findings) — a working implementation that quietly disagrees with the spec is better handled the moment it's noticed than left for the next person to discover.
2. **Determine which is wrong: the implementation, or the specification.** If the spec's contract is achievable but the implementation took a shortcut, fix the implementation. If the spec's contract turns out to be genuinely unachievable or wrong once real code was written against it, the specification has a flaw.
3. **If the specification is wrong, write an ADR proposing the amendment** — following the format in `docs/adr/`: Context, Decision, Alternatives Considered, Consequences, Why the chosen approach is preferred. Update `architecture-specification.md` only after the ADR is accepted, never as an incidental part of the implementation PR.
4. **Never let "the implementation revealed a flaw" become an excuse to relitigate the whole architecture.** The amendment should be as narrow as the actual flaw — a single method signature, a single invariant's exact wording — not a reopening of decisions the ADRs already settled (e.g., don't use one method-signature mismatch as license to reconsider whether the Persistence Gate should exist).

---

## 5. Failure Conditions

Stop implementation immediately — do not proceed by improvising a resolution — in any of the following situations.

- **The specification is internally inconsistent** (two sections describe incompatible behavior for the same subsystem, or a sequence in the "Sequence Specifications" section doesn't match the public API defined earlier in the same document). *Do instead:* document the exact inconsistency and raise it for a specification correction before writing code against either interpretation.
- **A requested change violates a frozen architectural invariant** (e.g., a feature request implies a second write path, or a UI component needs to construct an application-layer service directly to work). *Do instead:* find the way to deliver the requested product outcome within the existing contracts (usually: extend a facade method or add a `PersistenceOperation` kind) before assuming the invariant must bend; if no compliant path exists, escalate as a specification-amendment proposal, not a one-off exception.
- **Two governing documents contradict each other** (e.g., `architecture-target.md`'s folder plan and `architecture-specification.md`'s subsystem boundaries disagree about where something lives). *Do instead:* treat `architecture-specification.md` as authoritative for contracts and `architecture-target.md` as authoritative for rationale/sequencing; if the contradiction is substantive rather than cosmetic, flag it for reconciliation rather than picking a side silently.
- **Implementing the requested feature would require inventing a new architecture** (a genuinely new aggregate needing a facade shape not covered by the `PageOperations`/`FolderOperations` pattern, or a capability that doesn't fit the Gate's operation-kind model at all). *Do instead:* stop, and produce a proposal (following the ADR format) for the new pattern before implementing — this is a legitimate outcome of the architecture growing, not a violation, but it must happen deliberately, not as an implementation-time improvisation.
- **The migration phase this work depends on is unfinished** (e.g., a task assumes `PageOperations` exists and is the sole owner of page mutation, but Phase 2 of the migration plan hasn't completed and the old services still exist alongside it). *Do instead:* either complete the dependency phase first, or explicitly scope this task to work correctly against the current, not-yet-migrated state — never write new code assuming a target state that isn't actually true yet.
- **The task cannot be traced to a phase in the migration plan or to explicitly-scoped post-migration feature work.** *Do instead:* classify it first (which phase, or which facade's natural extension) before writing any code — an unclassified task is how "temporary" exceptions entered the pre-migration codebase.
- **An existing test would need to be deleted (not migrated) to make the change pass.** *Do instead:* treat this as a signal the change removes tested behavior rather than replacing it equivalently — confirm deliberately whether that behavior is meant to disappear, and if so, note it explicitly rather than deleting the test silently alongside the code change.

---

## 6. Continuous Architecture Guardrails

Standing rules for evaluating work over time, not just at the moment of one implementation task.

**How to decide whether a new subsystem is justified.** A new subsystem (not just a new file) is justified only when it represents a genuinely new category of responsibility not covered by any of the twelve in the specification — for example, a future "Sync Conflict Resolution" concern that doesn't fit inside `Sync`'s current reactive-reconciliation shape. It is not justified merely because an existing subsystem "feels crowded" — crowding is addressed by splitting along the existing ownership lines (e.g., a new `*Operations` facade for a genuinely new aggregate, per ADR-002), not by inventing a new kind of layer.

**When a new service/facade is allowed.** Only for a new aggregate that doesn't fit `PageOperations`/`FolderOperations` (e.g., Templates, Attachments) — and even then, it must follow the same shape (open/create/mutate/delete backed by the Persistence Gate), not a novel structure. A new facade for an *existing* aggregate's capability is never allowed — extend the existing one.

**When code should be merged instead of expanded.** Whenever two files independently implement the same shape for different triggers (the historical example: `persistSyncedPageDocument` and the Gate's write-parse-rebuild-replace step) — the fix is a shared internal helper called by both entry points, not a third implementation, and not leaving the duplication in place because "they serve different callers."

**How to detect duplicate ownership.** Before merging any PR that adds a method to any facade, grep for existing methods elsewhere in the codebase with similar names or the same verb (create/delete/move/rename/archive/restore) applied to the same aggregate. Two hits for the same verb-and-aggregate pair outside of one designated owner is duplicate ownership by definition, not a judgment call.

**How to detect accidental layering violations.** Diff new import statements against the dependency diagram on every PR — not just when a violation is suspected. An import from a lower layer into a higher one, or from a sibling subsystem into another sibling it isn't listed as depending on in the specification's per-subsystem "may depend on" section, is a violation regardless of how small or well-intentioned the specific import is.

**How to evaluate future pull requests against the architecture.** Every PR — architectural or ordinary feature work — is evaluated against §3 (Code Review Checklist) as a matter of course, not only when a reviewer suspects an issue. A PR that passes ordinary code review (readable, tested, does what it says) but fails the architecture checklist does not merge on the strength of the former; the two are independent gates, and the second one exists specifically because the pre-migration codebase's individual services were, by and large, well-written and well-tested in isolation — that was never what went wrong.

**The standing test for architectural health.** Periodically (and always before starting a new migration phase), re-ask the assessment's own question: for a handful of recently-shipped capabilities, is there exactly one file a new contributor would need to open to understand the whole thing, and exactly one write path underneath it? If the answer starts becoming "no" for new work the way it was for the pre-migration codebase, that is the signal to pause feature work and address it — not a signal to write a more detailed rule, but to recognize a rule already exists and isn't being followed, and ask why.

---

## Operational Contract

For every future implementation task:

1. Read this document in full.
2. Read the specific sections of `architecture-specification.md` (and, if rationale is unclear, `architecture-target.md` and `architecture-assessment.md`) relevant to the task.
3. State explicitly, before writing code, which items in §1 apply and what they resolve to for this task.
4. Implement only within the rules in §2, treating any needed exception as a trigger for §5, not a judgment call to make silently.
5. Perform every step in §4 before considering the task done.
6. Report — in the PR description or task summary, not buried in a comment — any point where implementation diverged from the specification, why, and whether it was resolved by fixing the code or by proposing a specification amendment. A clean report with nothing to disclose is the expected common case, not a formality to skip because nothing seemed to happen.
