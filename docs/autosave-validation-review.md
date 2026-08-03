# Autosave — Validation Review

**Status:** Research only. No code changes, no redesign. This is an adversarial review of the three frozen autosave documents — [`autosave-strategy-analysis.md`](./autosave-strategy-analysis.md), [`autosave-ownership.md`](./autosave-ownership.md), [`autosave-execution-model.md`](./autosave-execution-model.md) — conducted by re-reading the actual shipped source (`DocumentSession.ts`, `SaveCoordinator.ts`, `DocumentRegistry.ts`, `DocumentState.ts`, `PageOperations.ts`, `PagePersistenceCoordinator.ts`, `Workspace.ts`, `SelfWriteRegistry.ts`, `FolderOperations.ts`) against every claim the three documents make, not just against each other. The architecture is assumed correct until a specific, cited defect is found. Every finding below is classified Critical / Important / Future / No issue, per the checklist.

**Verdict, stated up front:** **no Critical issues found.** Five Important issues were found — all are precision/wording gaps in the execution model, not flaws in the ownership boundaries or the strategy — and are each traced to an exact fix. Details follow.

---

## 1. Internal consistency

### 1.1 Terminology — No issue
"Committed"/"Durable"/"Reconciled" (durability-model.md), "Trigger"/"Save request" (execution model §0), and the eight ownership questions' vocabulary are used identically across all three documents. No term is silently redefined between documents.

### 1.2 Ownership — No issue, one wording risk flagged in §4 below
Every ownership answer in `autosave-ownership.md` is exercised consistently in `autosave-execution-model.md`'s transition table (§2) and shutdown sequence (§7) — `PageOperations` orchestrates, `DocumentEditing`/`SaveCoordinator` schedules and enumerates, the Gate writes, `Workspace` is untouched. The one place this breaks down is the call-chain *direction* implied by execution-model §3's prose and the §4.2/§8 sequence diagrams — covered fully in §4 (Hidden coupling) below, since it's a coupling defect, not a disagreement about who owns what.

### 1.3 State transitions — Important issue found
The execution model's transition table (§2) and `DocumentState` (§1) are internally consistent with each other, but **incomplete against the actual `PageOperations.save()` implementation**. Reading `PageOperations.ts:281-331` directly: there are three distinct outcomes, not two:

1. A **synchronous, pre-flight throw** — "Cannot edit archived page" (line 300-304) or "No open document session"/"Page not found" (lines 284-298) — thrown *before* `session.commit()` or `saveCoordinator.beginSave()` is ever called. The session never enters `Saving`; it is left in whatever state it was already in.
2. The Gate returns `{status: 'abandoned'}` (page deleted concurrently) — `saveCoordinator.failSave()` runs, session reaches `SaveError`, and `save()` resolves normally (no throw).
3. The Gate throws (write/parse failure) — caught, `failSave()` runs, session reaches `SaveError`, and the error is *re-thrown* to the caller.

The execution model's T11 ("Save fails") only describes outcomes 2 and 3, both of which correctly reach `SaveError`. **Outcome 1 is not represented anywhere in the state machine** — it's a save request that fails without ever becoming a state transition. For an archived page specifically, this has a real consequence the failure-scenario stress test (§5 below) works through: nothing in §4.1's coalescing table ever clears `isDirty` for a page that can't be saved for a structural reason (as opposed to a transient one), so a debounce timer will keep firing, keep calling into the same synchronous throw, forever, for as long as the session stays open and dirty against an archived page.

**Classification: Important.** This does not violate any of Rules 1/2/4/5/7/12, and it does not require new ownership — it requires the execution model's transition table to add a fourth row ("save request rejected before entering `Saving`") and an explicit policy for it (see §5.1 for the concrete recommendation: treat it identically to `SaveError` for the purposes of "does the debounce timer keep retrying," but distinguish it from a transient Gate failure so a future implementation doesn't spin retrying a rejection that cannot succeed).

### 1.4 Execution model agrees with ownership — Important issue found (see §4)
Covered fully under Hidden Coupling (§4) below — the substance of the finding is a call-direction defect, which is a coupling question, not a disagreement about *who* owns *what*. `autosave-ownership.md`'s answers themselves are not wrong; the execution model's realization of them needs one correction.

### 1.5 Durability model respected — No issue
Re-verified directly: `DocumentSession`'s `currentRevision`/`savedRevision` split matches Committed exactly; `PagePersistenceCoordinator.writeParseRebuildReplace` (the actual code, not just the spec's description of it) matches Durable's stated guarantees precisely, including the absence of `fsync`/atomic-rename the durability model already discloses. Nothing in the execution model claims a stronger guarantee than the code provides anywhere.

---

## 2. Architecture rules

| Rule | Verified against | Result |
|---|---|---|
| **Rule 1** (one owning facade) | `PageOperations.save()`/`create()`/`archive()`/etc. remain the only methods that mutate a page's lifecycle; the proposed new commit-only and flush-orchestration methods (§3 below) are new *verbs* on the same facade, not a second facade. | **No issue.** |
| **Rule 2** (every write flows through the Gate) | `PagePersistenceCoordinator.enqueue` is still the only call site touching `VaultFileSystem.writeFile`/`deleteFile`/`moveFile` for page content (confirmed by reading the full file — every `run*` method funnels through `writeParseRebuildReplace` or a direct, single `fileSystem` call inside the Gate itself). Nothing in the three documents adds a second writer. | **No issue.** |
| **Rule 4** (Platform owns OS-level fs/watcher) | `SelfWriteRegistry` (verified by reading it directly) lives in `vault/providers/`, uses a per-path **counter**, not a time window — meaning autosave's higher write frequency introduces **no new race risk here at all**, contrary to this review's own earlier hedge (see §5.8 below, which corrects `autosave-strategy-analysis.md`'s flagged-as-uncertain claim). | **No issue** — and one prior open question is now closed, favorably. |
| **Rule 5** (business policy in the facade, not infrastructure) | The §4.1 coalescing decision (suppress/execute/defer based on `DocumentState` + `isDirty`) is structural, not business policy, by the same test Rule 5's own amendment already uses for the Gate's dequeue-time checks — verified against `PagePersistenceCoordinator.runCreate`'s actual existence guard (lines 232-266), which is exactly the shape (state-dependent, no product judgment) the coalescing table mirrors. The one true business-policy check that exists today — the archived-page rejection and the draft-vs-real branch in `save()` (lines 288-304) — is untouched by any of the three documents and stays exactly where Rule 5 already puts it. | **No issue**, given the §3/§4 fix below is applied so the mechanical check and the policy check aren't blurred into the same call site by accident. |
| **Rule 7** (dependencies point downward) | `Workspace.ts` read directly: its constructor takes **zero** injected dependencies — stronger confirmation than `autosave-ownership.md` §7 needed, since the diagram-level claim ("depends on nothing") is also true of the actual, shipped class, not just the intended one. The navigation/shutdown flush placement (trigger point above `Workspace`, logic inside `PageOperations`) is the only design choice this rule forces, and it's unchanged by anything found in this review. | **No issue.** |
| **Rule 12** (no capability has more than one write path) | Unaffected — every trigger still funnels to the one `PageOperations.save()` → Gate path; the coalescing layer sits *above* that path (deciding whether to call it) and never introduces an alternate route to disk. | **No issue.** |

---

## 3. Existing code — contract vs. extension

For each subsystem named in the checklist, whether implementation would need to change a frozen contract or can extend one as-is:

| Subsystem | Finding |
|---|---|
| **`DocumentSession`** | **Requires one new method, not currently in spec §9's listed API.** No method exists today that lets a caller commit a transaction *without* going through `PageOperations.save()` (which always also calls `saveCoordinator.beginSave()` and enqueues to the Gate). The execution model's "commit on every keystroke" design (§1, T2) needs a commit path that stops at Committed and never reaches the Gate — that's not `save()`, and `DocumentSession.commit()` itself is already suitable, but it's marked `-` (internal, never imported from outside `application/`, spec §9 header), so **nothing outside `application/` can call it directly today.** This is a real, narrow gap: a new public `PageOperations` method is needed (see §4 below) whose entire job is "commit into the session, no Gate call" — mechanically small, but not yet expressible in the frozen contract. |
| **`SaveCoordinator`** | Needs new methods (timer bookkeeping per §5 of the execution model; the §4.1 decision table) — additive to a class whose own header comment already anticipated exactly this ("Coordinate autosave"). No signature it already exposes needs to change. |
| **`DocumentRegistry`** | `getAll()` already exists and already returns every open session (verified, `DocumentRegistry.ts:47-49`) — the shutdown enumeration in execution-model §7 requires no new method here. `close()` (`DocumentRegistry.ts:66-68`) currently just deletes from the map — it does **not** call anything on the session before removing it. Confirmed: `DocumentSession` has **no `dispose`/`markDisposed` method at all** — `DocumentState.Disposed` is declared in the enum with no producer anywhere in the codebase, not even a reachable one. Reaching it requires adding a new method to `DocumentSession`'s (already-internal) API, called from `DocumentRegistry.close()`. Small, additive, no rule implication — but real. |
| **`PageOperations`** | Needs the two new methods above (commit-only, flush-orchestration/enumeration-consuming) plus, per §4 below, the actual receiving end for UI-facing triggers — currently has none of the three. `save()`, `create()`, `archive()`, etc. are otherwise unaffected; the archived-page and draft-vs-real logic inside `save()` (lines 288-306) needs no change. |
| **Persistence Gate (`PagePersistenceCoordinator`)** | No change of any kind. Verified directly — the class has no concept of *why* an operation was enqueued, exactly as all three documents assume. |
| **`Workspace`** | No change — confirmed zero-dependency, confirmed `openPage`/`closePage` stay synchronous. |
| **`Vault`** | No change relevant to autosave. (Aside, out of scope for this review but worth a one-line flag since Vault was named explicitly: `Vault.addFolder` and a `'create-folder'` Gate operation kind already exist in the shipped code, which means ADR-017 §9's "Vault has no live mutation method to add a new Folder mid-session" is **stale** — that limitation has since been closed elsewhere in the codebase. This has no bearing on autosave's correctness and isn't acted on here; flagged only because Vault was on the explicit review list.) |
| **`Sync`/`VaultSyncService`** | No change needed, and the specific concern `autosave-strategy-analysis.md` §4 flagged as "worth a verification step" is now verified, not just assumed — see §5.8. |

---

## 4. Hidden coupling

This is where the review's one substantive defect lives.

### 4.1 UI-facing triggers must not call `SaveCoordinator` directly — Important issue found

`autosave-execution-model.md` §3 states the coordination point for debounce/blur is "owned by `SaveCoordinator`," and §4.2/§8's Mermaid diagrams show triggers arriving directly at a participant labeled `SC` (`SaveCoordinator`) — e.g. `User->>SC: blur (T4) -> save request`. Read literally, this has triggers (editor blur events, debounce timers armed from UI-driven commits) calling into `SaveCoordinator` *before* `PageOperations` is involved at all.

That contradicts two things simultaneously:
- `DocumentEditing`'s own spec header: `SaveCoordinator` is listed under "Internal collaborators," explicitly not exported outside `application/` — nothing outside `PageOperations` is supposed to hold a reference to it.
- `ARCHITECTURE_RULES.md` Rule 6 ("UI never constructs application-layer services") and, by the same logic, never reaches *past* the facade to an internal collaborator either — the whole point of `PageOperations` being the single owning facade (Rule 1) is that external callers, including UI event handlers, only ever call it.

This is exactly the kind of thing checklist item 4 asks to be hunted for: `autosave-ownership.md` itself never actually claims UI calls `SaveCoordinator` directly — its Q1 answer is explicit that "delegation is not a second owner" and mechanism stays internal. The execution model's diagrams drifted from that during the mechanical work of drawing the sequence, most likely because collapsing "UI event → `PageOperations` method → `SaveCoordinator`'s decision" into two hops felt like unnecessary diagram noise. It reads, as written, like a second entry point.

**The fix, concretely (no redesign, no rule change):** every trigger in §2's table (T3-T8) calls a **public `PageOperations` method** — `save()` for the manual/API case (already public and unchanged), and one new method (naturally named something like `requestSave(pageId)`, taking no payload, per §0's own design principle) for debounce/blur/navigation/shutdown. That method's body looks up the session, then delegates the §4.1 decision table to its `SaveCoordinator` collaborator — internally, exactly as `autosave-ownership.md` Q1/Q4 already describe. `SaveCoordinator` remains exactly as internal as it is today; only its owning facade's public surface grows by one method. The Mermaid diagrams in §4.2/§7/§8 should show `User->>PO: blur (T4)` / `PO->>SC: evaluate + dispatch`, not `User->>SC` directly.

**Classification: Important, not Critical.** Nothing about ownership (`autosave-ownership.md`) needs to change — this is entirely a precision defect in how the execution model *drew* the call chain, not a defect in *who* was assigned each responsibility. It must be fixed before implementation (an implementer following the diagrams literally would create a real Rule 6/spec violation), but the fix is a one-line correction to the entry-point description plus five relabeled diagram arrows, not a new design.

### 4.2 Everything else — No issue
- **Timer ownership:** exclusively `SaveCoordinator`, per-session, no other subsystem holds a timer handle or a copy of "when did this session last commit." Confirmed no competing timer/interval exists anywhere else in the reviewed files.
- **Save scheduling vs. dirty detection:** cleanly separated, as designed — `DocumentSession` computes `isDirty`, `SaveCoordinator` reads it but never writes a parallel copy. Confirmed no shadow "isDirty" field was introduced by anything in the three documents.
- **Navigation:** `Workspace`'s zero-dependency constructor (confirmed by reading the file) structurally forecloses any coupling in this direction — it cannot reach into `PageOperations`/`SaveCoordinator` even by mistake, because it has no reference to either.
- **Shutdown:** Composition Root → `PageOperations` only, one direction, matches spec §11's own "no conditional business logic" invariant (the Root still doesn't decide *how* to flush, only *that* it should).
- **UI notifications:** `DocumentSession.subscribe`/`.state` reached via the already-public `PageOperations.getSession` — no new coupling; this path is unchanged by anything in the three documents.

---

## 5. Failure scenarios

- **5.1 Save failures (transient — Gate write error):** Coherent. Reaches `SaveError` via T11, content preserved (`markSaveFailed`'s own doc comment, confirmed), picked up by the next non-suppressed trigger (T12). **No issue**, contingent on §4.1's fix.
- **5.2 Save failures (structural — archived page, per §1.3 above):** **Important**, already detailed in §1.3. Concrete recommendation: the new `PageOperations.requestSave()` (§4.1's fix) must catch the synchronous throw and route it to `SaveCoordinator.failSave()` the same as a Gate failure — collapsing outcome 1 into the same `SaveError` state outcome 2/3 already reach, rather than leaving it as an unhandled rejection with no state transition at all. This still doesn't stop a debounce timer from retrying an unwinnable rejection indefinitely (every retry will throw the same way) — but once it's modeled as `SaveError` like any other failure, that's a pre-existing, accepted property of the "next trigger retries" design (`autosave-execution-model.md` §1.4 already declines a dedicated backoff/retry mechanism, for good reason), not a new pathology this finding introduces. Worth one explicit UX note for later: an archived-out-from-under-you session should probably disable further edits (mirroring ADR-017 Decision item 9's existing pattern for drafts) — a product question, not an architecture one, and explicitly not resolved here.
- **5.3 Repeated failures:** Coherent for the transient case (§5.1) — each retry is a fresh, independent Gate attempt, isolated per spec §5's own per-operation failure isolation. For the structural case (§5.2), "repeated" is actually the norm until something external changes (the page is restored, or the session is closed) — already covered by the fix above.
- **5.4 Concurrent requests (same session):** Coherent — §4.1's table, re-verified against the actual `PagePersistenceCoordinator`'s per-id promise-chain queue (confirmed it exists and behaves as documented). No issue.
- **5.5 Multiple dirty documents:** Coherent — confirmed independence at both layers (`SaveCoordinator`'s presumed per-id bookkeeping mirrors the Gate's actual `Map<string, Promise<unknown>>`, which is real and per-id, verified directly).
- **5.6 Navigation during save:** Coherent, contingent on §4.1's fix (the navigation trigger must also go through the new `PageOperations` entry point, not `SaveCoordinator` directly, to be consistent with the same rule the blur/debounce case needs).
- **5.7 Shutdown during save:** Coherent — `Promise.allSettled`-style parallel await over `DocumentRegistry.getAll()`'s actual, verified return shape (`readonly DocumentSession[]`). No issue.
- **5.8 Force quit:** Coherent, and honestly scoped — the execution model correctly declines to claim anything survives a force-kill, consistent with `durability-model.md`'s own accepted gap. No issue.
- **5.9 External file edits (Sync interaction):** **Previously an open question, now resolved — No issue.** `autosave-strategy-analysis.md` §4 flagged "worth a verification step... confirming the self-write suppression window comfortably covers a tighter autosave cadence" as an unverified assumption. Having now read `SelfWriteRegistry.ts` directly: suppression is implemented as a **per-path pending counter**, not a time window at all (`markPending`/`consumePending`, incrementing/decrementing, explicitly designed for "two overlapping internal writes to the same path... each get their own echo suppressed"). There is no cadence this could fail to keep up with — the mechanism is frequency-independent by construction. This closes the one genuinely open verification item the strategy document deferred.

---

## 6. Future scalability — attempts to break the design

Revisited adversarially, specifically trying to find a feature that forces a redesign (not just extends the model, which the execution model's own §9 already checked more gently):

- **Undo/Redo, Version History, Rename, Attachments, Templates:** No break found — each still produces ordinary `DocumentTransaction`s or reuses the existing metadata-patch/promotion path; §4's coalescing table doesn't know or care what produced a commit.
- **AI editing:** No break, one real question (already flagged, not new): should AI-authored commits use the same debounce interval as human typing. A tuning/policy question, not a break.
- **Plugins/future API:** No break — confirmed these already have a documented, separate, direct entry point (ADR-017 §6) that was never routed through the debounce/coalescing machinery to begin with; nothing in this review found a way that boundary could leak.
- **Multiple windows:** Genuinely not solved (this was already disclosed, not discovered here) — `DocumentRegistry.getAll()` is process-global today; a second window sharing one `Vault` would need either a second registry or a window-scoped filter. This is **correctly deferred**, not a hidden break — the *shape* of §7's shutdown sequence doesn't change, only its scope, and multi-window doesn't exist as a target today (no code, no ADR proposing it), so designing for it now would itself violate `implementation-rules.md`'s "don't build for a hypothetical future."
- **Cloud Sync:** No break — confirmed the coalescing table, if anything, produces a *cleaner* upstream feed (fewer, more meaningful writes) than a naive per-trigger design would.
- **Collaboration:** Genuinely would need a different commit-granularity layer (per `autosave-strategy-analysis.md` §2's Google Docs/Notion research) — but this is a boundary this document already draws correctly, not a break discovered now: collaboration would replace/augment the commit layer (§1/T2), leaving §4's coalescing and §7's shutdown sequence intact underneath it, because those operate on "is this session's latest state durable," a question that doesn't change shape even if what produces "latest state" becomes an OT/CRDT merge instead of a local buffer.

**No future feature in this list was found to force a redesign of anything in the three frozen documents.** All items above are correctly classified as **Future** (deliberately deferred) rather than **Critical**/**Important**.

---

## 7. Final verdict

| # | Area | Issue | Classification |
|---|---|---|---|
| 1 | State transitions | Synchronous pre-flight rejections from `PageOperations.save()` (archived page, missing session) aren't represented in the transition table | **Important** |
| 2 | Existing code / `DocumentSession` | No public (even internal-to-`application/`) method exists yet to commit without triggering a Gate write — needed for per-keystroke commit | **Important** |
| 3 | Existing code / `DocumentRegistry`+`DocumentSession` | `close()` doesn't transition the session to `Disposed`; `DocumentSession` has no method to reach that state at all yet | **Important** |
| 4 | Hidden coupling | Execution-model §3 prose and §4.2/§7/§8 diagrams show UI-facing triggers calling `SaveCoordinator` directly, bypassing `PageOperations` — violates the internal-collaborator boundary and Rule 6 as drawn (fixable by routing through one new `PageOperations` method) | **Important** |
| 5 | Failure scenarios | The fix for #4 must also ensure synchronous throws from `PageOperations.save()` are caught and converted to `SaveError` rather than becoming unhandled promise rejections when triggered from a non-awaited background trigger (debounce, navigation-flush, shutdown-flush) | **Important** |
| 6 | Sync / self-write suppression | Previously flagged as unverified; confirmed frequency-independent by design — no issue | **No issue** (resolves a prior open question favorably) |
| 7 | Architecture Rules 1/2/4/5/7/12 | All six re-verified directly against shipped code | **No issue** |
| 8 | Multiple windows | Enumeration is process-global; correctly out of scope until multi-window is an actual target | **Future** |
| 9 | Collaboration | Would need a different commit-granularity layer underneath the same coalescing/shutdown machinery | **Future** |
| 10 | AI editing debounce policy | Same interval or different — undecided, deliberately, as a tuning question | **Future** |

**No Critical issues were found.** Nothing in the three documents requires reopening an ownership boundary, violating a numbered architecture rule, or introducing a second write path, a second facade, or a new subsystem. Every Important issue above is a precision gap between the execution model's prose/diagrams and the exact shape of the already-shipped code — each has a named, narrow, mechanical fix that stays inside `PageOperations`'s and `SaveCoordinator`'s already-assigned roles. The recommended next step, before writing implementation code, is a small, targeted revision pass on `autosave-execution-model.md` alone (§§1.3, 3, 4.2, 7, 8) to fold in fixes #1, #3, #4, and #5 above — `autosave-strategy-analysis.md` and `autosave-ownership.md` need no changes at all.
