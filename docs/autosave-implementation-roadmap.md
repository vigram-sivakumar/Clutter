# Autosave — Implementation Roadmap

**Status:** Planning only. No code in this document. This roadmap sequences implementation of the frozen specification — [`durability-model.md`](./durability-model.md), [`autosave-strategy-analysis.md`](./autosave-strategy-analysis.md), [`autosave-ownership.md`](./autosave-ownership.md), [`autosave-execution-model.md`](./autosave-execution-model.md) — into commit-sized milestones. Every method name, section reference, and file path below traces back to one of those four documents (mainly the execution model's Freeze statement) or to source verified during the validation pass; nothing here introduces new design. Where a file path hasn't been directly verified in this conversation (the Composition Root, the navigation call site above `Workspace`), it's marked so explicitly rather than guessed.

## How to read this roadmap

Each milestone is scoped to satisfy, on its own: single responsibility, reviewable in isolation, `tsc` clean, full test suite green, application behavior unchanged for users unless the milestone's whole point is a behavior change (M6 only). Milestones M1-M5 are purely additive — new methods exist and are unit-tested, but nothing yet calls them from the UI, so user-visible behavior is identical to today through the end of M5. This is deliberate, not a violation of "no temporary architectural violations": unused-but-tested new methods on an already-public facade are ordinary incremental construction (per `implementation-rules.md`'s own framing of narrow, mechanical extensions), not the kind of speculative, no-consumer machinery `ARCHITECTURE_RULES.md` rule 13 warns against — every method built here has a named consumer already scheduled in a later milestone of this same roadmap, not an indefinite future one.

**Per-milestone commit discipline:** run `tsc` and the relevant test suite, report results, commit only on green — per the project's standing git-commit-workflow instruction. Do not batch two milestones into one commit.

---

## M1 — Wire `Disposed` into `DocumentSession`/`DocumentRegistry`

**Objective:** Close the gap `autosave-execution-model.md` §1.6 identifies: `DocumentState.Disposed` exists in the enum with no producer anywhere in the codebase. Make `DocumentRegistry.close()` actually transition a session to `Disposed` before removing it, so nothing holding a stale reference can observe a session that's been silently removed from the registry but still reports `Clean`/`Saving`.

**Files expected to change:**
- `apps/app/src/core/engine/DocumentSession.ts`
- `apps/app/src/core/engine/DocumentRegistry.ts`

**Public API changes:**
- `DocumentSession` gains one new method: `markDisposed(): void` — sets `_state = DocumentState.Disposed`, calls `notify()`, idempotent-safe if called twice. (Internal-to-`application/` API, per spec §9 — not exported outside it, same visibility as `beginSave`/`markSaved`/`markSaveFailed` today.)

**Internal refactors:**
- `DocumentRegistry.close(pageId)`: call `session.markDisposed()` before `this.sessions.delete(pageId)`, guarded by the session still existing (no-op if `close()` is called for an id with no open session, unchanged from today).
- **Addendum, found during M1's own post-implementation audit (not in the original milestone scope, folded in per the divergence process — see `autosave-execution-model.md` §1.6):** `DocumentRegistry.clear()` is a second, already-shipped path that removes every session at once (called from `Application.close()`), which the original milestone scope and the execution model's §1.6 both failed to enumerate. `clear()` now disposes every session it holds, in a loop, before clearing its map — same guarantee as `close()`, applied in bulk.

**Tests to add/update:**
- `DocumentSession`: a test asserting `markDisposed()` transitions from every other state (`Clean`, `Saving`, `SaveError`) to `Disposed`, and that a second call is a no-op (state stays `Disposed`, no error thrown).
- `DocumentRegistry`: a test asserting `close(pageId)` leaves the (now-orphaned) `DocumentSession` reference in `Disposed` state, not whatever state it was in before closing — capture the session object before calling `close()`, assert its state afterward.

**Risks:** Minimal. This is a pure addition with one new call site inside an existing method. The only behavioral risk is a UI component that held a reference to a closed session's `subscribe()` and reacts to the new `notify()` call on disposal — grep for any `getSession(pageId)` consumers that subscribe and don't already unsubscribe on unmount before merging, to confirm none assume a disposed session never fires `notify()` again.

**Verification steps:**
1. `tsc` clean.
2. `DocumentSession`/`DocumentRegistry` unit suites green, including the two new tests above.
3. Full existing test suite green (regression check — this touches a method, `close()`, called from `PageOperations.close()`/`delete()` today; confirm no existing test asserted anything about post-close session state that this now contradicts).
4. Manual smoke check: open a note, close it, confirm no console errors (a subscriber reacting to the new disposal `notify()` for the first time would surface here).

---

## M2 — Add `PageOperations`'s commit-only method

**Objective:** Implement the capability `autosave-execution-model.md` §3.1 requires as a named, explicit contract: a way to commit a new `DocumentRevision` into `DocumentSession` without triggering a Persistence Gate write. This is what T1/T2 in the execution model's transition table (§2) call on every keystroke.

**Files expected to change:**
- `apps/app/src/core/application/page/PageOperations.ts`

**Public API changes:**
- `PageOperations` gains one new method. Per §3.1's stated contract (name left to this milestone, since the frozen document deliberately doesn't fix it): `commitEdit(pageId: string, markdown: string): void`. Body: look up the session via `this.documentRegistry.get(pageId)`; if absent, no-op (mirrors `T1`'s precondition, "session exists, not `Disposed`" — a disposed/nonexistent session silently ignoring a stray commit is consistent with §4.1's `Disposed` row treating every save request as suppressed, and a commit is the harmless, no-op-if-absent case of the same principle); otherwise call `session.commit(new DocumentTransaction(markdown))` and nothing else — no `beginSave()`, no Gate call, no draft-promotion check.

**Internal refactors:** None — `save()`'s own body is untouched, per §3.1 and §3's explicit statement that `save()` "is completely unchanged."

**Tests to add/update:**
- `PageOperations`: a test asserting `commitEdit()` updates `getSession(pageId)!.currentRevision` and leaves `DocumentState` unchanged (still `Clean`, not `Saving`) — the core distinguishing property from `save()`.
- A test asserting `commitEdit()` never calls the injected `PagePersistenceCoordinator` mock — the concrete, checkable form of "no Gate involvement" (spy/mock assertion, zero calls).
- A test asserting `commitEdit()` for an id with no open session is a silent no-op (no throw), matching T1's precondition framing.

**Risks:** Low — new method, no existing call site touches it yet (nothing calls `commitEdit()` until M6). The main risk is scope creep: a reviewer might be tempted to also decide the archived-page interaction here (§3.1 explicitly leaves this open: "an archived page presumably should still accept a commit... but that's a design detail, not settled here"). Resolve it minimally for this milestone — allow the commit unconditionally, since it's in-memory-only and has no policy implication until something tries to persist it — and don't let that micro-decision expand this milestone's scope.

**Verification steps:**
1. `tsc` clean.
2. `PageOperations` unit suite green, including the three new tests.
3. Full test suite green (regression check — `save()` itself is untouched, so this should be a no-op for every existing test).

---

## M3 — Implement the coalescing decision algorithm in `SaveCoordinator`

**Objective:** Implement `autosave-execution-model.md` §4.1's decision table as a pure, directly-testable method on `SaveCoordinator`, decoupled from any actual timer or Gate call — the algorithm that decides, for a given session's `(DocumentState, isDirty)` pair, whether a save request should execute, be suppressed, or be deferred.

**Files expected to change:**
- `apps/app/src/core/engine/SaveCoordinator.ts`

**Public API changes:**
- `SaveCoordinator` gains one new method, internal to `application/` per its existing visibility: `evaluate(session: DocumentSession): 'execute' | 'suppress'` (two outcomes, not three — per §4.1's own note that the `Saving`+dirty "defer" row needs no new field or return value, because T10's restart check already covers it; `evaluate()` returning `'suppress'` for that row is correct and sufficient, since deferral is realized entirely by T10's logic, added in M4, not by anything `evaluate()` itself needs to track).

**Internal refactors:** None yet — this method has no caller until M4. Pure function of its input (`session.state`, `session.isDirty`), no new fields on `SaveCoordinator`.

**Tests to add/update:**
- One test per row of §4.1's table: `Clean`+not-dirty → suppress; `Clean`+dirty → execute; `SaveError`+dirty → execute; `Saving`+not-dirty → suppress; `Saving`+dirty → suppress (the "defer" row, verified here only as returning the same value as the stale-duplicate row — its actual deferred-restart behavior is M4's concern, not this method's); `Disposed` → suppress unconditionally. Each test constructs a `DocumentSession` (or a minimal fake exposing `state`/`isDirty`) in the exact state named and asserts `evaluate()`'s return value — this table, run against real `DocumentState` values, is the single most valuable test this milestone produces, since it's the literal executable form of the frozen specification's central algorithm.

**Risks:** Very low — pure logic, no I/O, no async, easiest milestone in this roadmap to review and verify by inspection against §4.1's table directly, cell by cell.

**Verification steps:**
1. `tsc` clean.
2. `SaveCoordinator` unit suite green, all six table-row tests passing.
3. Full test suite green (trivially, since nothing calls this method yet).
4. Review checklist: diff the six test cases directly against `autosave-execution-model.md` §4.1's table, confirm a 1:1 correspondence — this is the one milestone where the review step is literally "does the code match the frozen table," not general code review.

---

## M4 — Implement `PageOperations.requestSave()`, including synchronous-failure handling and the T10 restart

**Objective:** Implement the single public entry point `autosave-execution-model.md` §3 requires — the one method every background trigger (debounce, blur, navigation, shutdown) will call starting in M5-M8. Wires together M2's commit-only groundwork (not directly — `requestSave()` doesn't commit, it flushes what's already committed), M3's coalescing decision, and the existing `save()` method, and implements the two remaining pieces of logic the execution model names explicitly: T11a's synchronous-failure catching (§1.3a) and T10's automatic restart-on-still-dirty behavior (§2, T10's row).

**Files expected to change:**
- `apps/app/src/core/application/page/PageOperations.ts`
- `apps/app/src/core/engine/SaveCoordinator.ts` (extending `completeSave()` for the T10 restart check — see below)

**Public API changes:**
- `PageOperations` gains: `requestSave(pageId: string): void`. Fire-and-forget by design (§0 — a save request is a signal; nothing in this milestone's callers, all still hypothetical until M5-M8, awaits its return), but internally `async` so it can `await` the underlying `save()` call and catch its rejection. Body: look up the session (`documentRegistry.get(pageId)`); if absent, no-op (mirrors `commitEdit()`'s and §4.1's `Disposed`-row treatment). Otherwise loop: `this.saveCoordinator.evaluate(session)` (M3); if `'suppress'`, return; if `'execute'`, call `this.save(pageId, session.currentRevision.markdown)` inside a `try`/`catch` and, on success, loop back to `evaluate()` again (this realizes T10's restart with no extra state). **Amendment, found during implementation (M4 final audit):** on catch, the original text here said to call `this.saveCoordinator.failSave(session, session.currentRevision)` directly — that's wrong, because `failSave()`'s existing stale-completion guard compares against a tracked `activeSaves` entry that doesn't exist for this path (`beginSave()` never ran), so it would silently swallow the call. The correct target is a new method, `SaveCoordinator.rejectSaveRequest(session)` — unconditional, no revision parameter — with the catch block first checking `session.state !== SaveError` so a failure `save()` already routed through its own internal `failSave()` call (a genuine Gate failure, T11b) isn't handled a second time.

**Internal refactors:**
- `SaveCoordinator.completeSave()`: after `session.markSaved(revision)`, add the T10 restart check — if `session.isDirty` is still true (comparing against the *current* `currentRevision`, which may have advanced since this save began), call back into a re-issued save request for this session. This requires `SaveCoordinator` to be able to reach `PageOperations.requestSave()` — **the one real design choice this milestone must make explicitly, since the frozen documents describe the *behavior* (T10 restarts automatically) but not the exact call-direction mechanics of `completeSave()` reaching back out to `requestSave()`.** Recommended resolution, consistent with §3's frozen call-direction rule (`PageOperations → SaveCoordinator`, never the reverse, as an import/reference direction): `completeSave()` does **not** call `requestSave()` itself. Instead, `completeSave()` returns a boolean (`stillDirty: boolean`) or exposes the fact via its existing `session.isDirty` being independently readable, and **`requestSave()`'s own `save()` call site (in `PageOperations`, this milestone) is what checks `session.isDirty` after `save()` resolves and re-calls `this.requestSave(pageId)` if still true.** This keeps `SaveCoordinator` from ever needing a reference back to `PageOperations` (preserving the one-directional dependency §3 establishes as a hard rule, not a convenience) and keeps the restart loop entirely inside `requestSave()`'s own body — a `while (this.saveCoordinator.evaluate(session) === 'execute')`-shaped loop, or an equivalent recursive-but-tail-position call, both of which terminate because each iteration only proceeds if `isDirty` was still true, which only happens if new content actually arrived during the previous save.

**Tests to add/update:**
- `PageOperations.requestSave()`: one test per §4.1 row already covered logically in M3, now verified end-to-end — `Clean`+dirty calls `save()` once; `Clean`+not-dirty never calls `save()` (spy assertion); `Saving`+dirty defers (verified as: no second concurrent `save()` call while the first's promise is unresolved).
- A test for T11a: mock `save()` to throw synchronously (simulate the archived-page case) and assert (a) `requestSave()`'s returned promise resolves, not rejects — i.e., the failure never becomes an unhandled rejection, and (b) the session's `DocumentState` is `SaveError` afterward (via `SaveCoordinator.rejectSaveRequest()` — see this milestone's amendment above).
- A test for T10's restart: commit revision 1, call `requestSave()`, and — before the mocked Gate call resolves — commit revision 2 (simulating typing during the save); assert that once the first Gate call resolves, a *second* `save()` call automatically fires for revision 2, with no second external `requestSave()` call.
- A concurrency test mirroring `autosave-execution-model.md` §4.2's worked example: three rapid `requestSave()` calls for the same session (simulating blur, debounce, navigation firing close together) with nothing typed in between, asserting the underlying `save()`/Gate mock was invoked exactly once.

**Risks:** This is the highest-risk milestone in the roadmap — it's the first one with real control flow (async, loop-shaped restart logic, error handling) rather than a pure addition. Specific risks: (a) the restart loop must provably terminate — verified by the T10 restart test above showing it only re-fires when genuinely dirty, never unconditionally; (b) the synchronous-vs-asynchronous failure distinction (§1.3a) is easy to get subtly wrong if `save()`'s synchronous throws and its promise-rejection throws aren't both funneled through the same `catch` — a single `try { await this.save(...) } catch { ... }` block around the whole call, not two different catch strategies, is the simplest and safest shape, and should be reviewed specifically for this.

**Verification steps:**
1. `tsc` clean.
2. `PageOperations`/`SaveCoordinator` unit suites green, all new tests above passing, with particular attention to the restart-termination and unhandled-rejection tests — these two are the ones most likely to reveal a subtle bug if the implementation deviates from the described shape.
3. Full test suite green.
4. Manual review: trace `requestSave()`'s body against `autosave-execution-model.md` §3's three numbered steps and §1.3a's requirement, confirm every line maps to a named requirement — this milestone should have no code that isn't directly justified by a specific passage in the frozen execution model.

---

## M5 — Timer lifecycle in `SaveCoordinator`

**Objective:** Implement the per-session debounce and ceiling timers `autosave-execution-model.md` §5 specifies, wired to call `PageOperations.requestSave()` on expiry, armed and reset from M2's commit-only method.

**Milestone summary, confirmed by post-implementation audit (grep of every `commitEdit(`/`requestSave(` call site in the codebase):**
- M5 implements the autosave engine and timer infrastructure.
- The running application is intentionally unchanged — `commitEdit()` has zero production callers, `requestSave()`'s only non-test call site is the timer-fire callback itself (transitively unreachable, since nothing arms it), and the production editor path still calls the original, unmodified `PageOperations.save()` exactly as it did before M1.
- **M6 is the milestone that actually activates autosave**, by wiring the editor to `commitEdit()` and routing save triggers through `requestSave()`.

**Files expected to change:**
- `apps/app/src/core/engine/SaveCoordinator.ts`
- `apps/app/src/core/application/page/PageOperations.ts` (wiring `commitEdit()` to arm/reset the timer, and `close()`/`delete()` to cancel it)

**Public API changes:** None new on `PageOperations`. `SaveCoordinator` gains internal (not exported outside `application/`) timer bookkeeping — no change to its already-public-within-`application/` surface beyond what M3/M4 already added.

**Internal refactors:**
- `SaveCoordinator` needs a reference to `PageOperations.requestSave` to call when a timer fires. Per §5's "firing direction" requirement (a timer's callback must re-enter through `PageOperations`, never act on `SaveCoordinator`'s own initiative directly against the Gate or `DocumentSession`) and per M4's established one-directional dependency rule (`SaveCoordinator` never holds a reference back to `PageOperations`), **the timer callback itself must be supplied by `PageOperations`, not looked up by `SaveCoordinator`.** Concretely: `PageOperations.commitEdit()` (M2) is extended to, after committing, call a new `SaveCoordinator` method — e.g. `saveCoordinator.scheduleSave(session, callback)` where `callback` is a closure `PageOperations` provides (`() => this.requestSave(pageId)`) — rather than `SaveCoordinator` importing or being constructed with a `PageOperations` reference. This preserves the Composition Root's existing construction order (`SaveCoordinator` is constructed before `PageOperations`, per spec §11 — it cannot hold a forward reference to something built after it) and keeps the dependency direction §3/M4 already established intact, without needing to change how `Application.ts` wires either object.
- `PageOperations.close()`/`delete()`: after `documentRegistry.close(pageId)` (which now also runs M1's `markDisposed()`), call a new `saveCoordinator.cancelTimer(pageId)` (or equivalent) so no timer for a disposed session can fire later — per §5's "when they are disposed" requirement.
- Default interval values (debounce window, ceiling): this milestone needs *some* concrete numbers to be testable, even though `autosave-strategy-analysis.md` §7 explicitly defers the exact tuning as a product decision, not an architecture one. **Use conservative, clearly-labeled placeholder constants** (e.g. a `const AUTOSAVE_DEBOUNCE_MS = 2000` and `const AUTOSAVE_CEILING_MS = 30000`, both exported or easily discoverable, with a comment citing `autosave-strategy-analysis.md` §7 Risk 3 as the reason they're placeholders, not tuned values) so the actual numbers are a one-line change later, not a design change.

**Tests to add/update:**
- Use fake/mock timers (the project's existing test infrastructure — confirm what's already available, e.g. Vitest's `vi.useFakeTimers()` or equivalent, before introducing a new dependency) throughout this milestone's tests, per the timer-lifecycle nature of what's being tested.
- A test asserting a single commit arms a debounce timer, and that the timer firing (after advancing fake time past the debounce interval) calls `requestSave()` for that session.
- A test asserting a second commit before the debounce interval elapses resets the timer (advancing time to just past the *original* deadline does not fire it; advancing further, past the *new* deadline, does).
- A test asserting the ceiling timer fires even under continuous re-committing that keeps resetting the debounce timer — the core "long unbroken typing session still saves" guarantee from `autosave-strategy-analysis.md` §1.
- A test asserting both timers are cleared on save success with nothing further dirty (no stray fire after a successful, caught-up save).
- A test asserting `PageOperations.close(pageId)`/`delete(pageId)` cancels any armed timer — advance fake time well past both intervals after closing, assert `requestSave()` was never called for the closed id.

**Risks:** Timer-based tests are historically the most flake-prone category in any test suite — mitigate by using fake timers exclusively (never real `setTimeout` waits) and asserting on call counts/arguments, not wall-clock timing. The construction-order dependency (`SaveCoordinator` built before `PageOperations`, callback supplied rather than referenced) is a real constraint worth double-checking against the actual Composition Root wiring before this milestone starts, not assumed.

**Verification steps:**
1. `tsc` clean.
2. `SaveCoordinator`/`PageOperations` unit suites green, all timer tests passing under fake timers (confirm no test suite run introduces real elapsed-time delays — a slow test suite here is a signal something reverted to real timers).
3. Full test suite green.
4. Confirm via the Composition Root's actual construction code (`Application.ts` — path to be confirmed against current source, not verified in this conversation) that the construction-order assumption above (`SaveCoordinator` before `PageOperations`) holds, or adjust the wiring approach if it doesn't, before merging.

---

## M6 — Wire the editor UI to commit-per-keystroke and `requestSave()`-on-blur

**Objective:** The first user-visible behavior change in this roadmap. Switch `MarkdownEditor` from its current "commit and save together, only on blur" wiring to two separate calls: `commitEdit()` on every input event, and `requestSave()` on blur, replacing today's direct `save(pageId, markdown)` call.

**Pre-implementation behavior audit performed before this milestone started** (per this project's own discipline — see the session transcript for the full audit). Two findings required an explicit decision, both resolved:

1. **Cursor-clobbering / native-undo-destroying re-render race, found by tracing what happens once `commitEdit()` fires per keystroke.** `MarkdownEditor`'s DOM-sync `useEffect` (`MarkdownEditor.tsx:42-52`) overwrites `editor.textContent` whenever the `markdown` prop differs from the DOM. Once every keystroke round-trips through `commit()` → `notify()` → a React re-render → a fresh `markdown` prop, a second keystroke landing before React flushes the first's re-render could see a stale prop and get its own DOM overwritten mid-edit, destroying the just-typed character, the cursor position, and (since `.textContent =` clears a `contentEditable` element's undo history) native Ctrl+Z. **Resolved: guard the sync effect on focus** — skip the DOM overwrite entirely whenever the editor currently has focus, since a focused editor's own DOM is authoritative over itself while the user is typing in it; only an *external* change (this editor not focused) should ever force a resync. No coalescing window was adopted alongside this fix — the focus guard alone is sufficient, and adding an artificial delay wasn't judged necessary without evidence it's needed (confirm via M6's required manual browser verification, not assumed).
2. **Draft promotion via a debounce-only trigger** — once `commitEdit()` arms the debounce timer, a brand-new, still-unpersisted draft could be persisted to disk automatically after `AUTOSAVE_DEBOUNCE_MS` of inactivity following a single keystroke, with no blur at all. This is exactly `autosave-strategy-analysis.md` §7 Risk 1's "two-word false start gets persisted" scenario, deliberately left as an open product decision until implementation. **Resolved: no special-casing.** A draft's first debounce-triggered save is treated identically to any other page's autosave — simplest, and consistent with every other trigger already treating drafts and real pages the same way (ADR-017's promotion path doesn't distinguish triggers). No code change follows from this decision — it's a confirmation that the existing `requestSave()`/`evaluate()` design (M3/M4) already produces the chosen behavior with no further work.

Two more findings were recorded but don't affect this milestone's scope: **window-level focus-loss** (as opposed to a DOM `blur` event) was never assigned to any of the eight milestones despite being named in the strategy analysis — a real, standing roadmap gap for a future milestone, not something to fold into M6. **"Closing an individual document while dirty"** is currently unreachable in production at all — grepped the entire `src/app`/`src/features` tree for any call to `PageOperations.close(`/`Workspace.closePage(` and found zero UI call sites; the app has no "close this document" feature today, so this scenario has no live consequence yet. A final finding, **no save-status/error UI exists anywhere today** (grepped for `SaveError`/`isDirty`/`Saving` in `src/app`, zero hits) — pre-existing (even today's blur-triggered `save()` call discards its promise via `void`), not introduced by this milestone, but worth naming since a silently-failing autosave is easier to miss than a silently-failing manual save.

**Files expected to change:**
- `apps/app/src/features/markdown/editor/MarkdownEditor.tsx`
- `apps/app/src/features/.../PageHost.tsx` (the `onCommit`/`onUpdateMarkdown` wiring — exact call sites verified earlier in this project at `PageHost.tsx:173`/`212`/`63-65`)
- `apps/app/src/features/.../toResourcePageModel.ts` (the `updateMarkdown` → `onUpdateMarkdown` plumbing, verified at `toResourcePageModel.ts:41-43`/`75-77`)

**Public API changes:** None at the `PageOperations` level — this milestone only changes which already-shipped (M2, M4) `PageOperations` methods the UI layer calls, and when.

**Internal refactors:**
- `MarkdownEditor` gains an `onInput` handler (native `contentEditable` input event, fires on typing/paste/deletion) calling a new `onEdit(markdown: string)` prop — unconditionally, on every event, relying on `DocumentSession.commit()`'s own existing no-op guard to filter out anything that isn't a real change, rather than re-implementing that diffing in the component.
- `handleBlur` (`MarkdownEditor.tsx:54-66` today) changes from computing `nextMarkdown` and calling `onCommit(nextMarkdown)` (which today flows through to `save()`) to: call `onEdit(editor.textContent)` once more (cheap, idempotent if nothing changed since the last input event — defense against any missed native event) then call a new, payload-free `onFlush()` prop that flows through to `requestSave(pageId)`.
- The DOM-sync `useEffect` (`MarkdownEditor.tsx:42-52`) gains a focus guard — skip the overwrite entirely while `document.activeElement === editor` (see the behavior audit above, Finding 1) — the one behavior change beyond simply adding the two new event handlers.
- `PageHost.tsx`/`toResourcePageModel.ts`: `ResourcePageModel`/`toResourcePageModel`/`toDraftPageModel` gain a new `requestSave(): void` member/parameter alongside the existing `updateMarkdown`/`onUpdateMarkdown`, threaded through the same prop-drilling shape already in place. `PageHost`'s `onUpdateMarkdown` callback body changes from `void application.pageOperations.save(pageId, markdown)` to the synchronous `application.pageOperations.commitEdit(pageId, markdown)` (no `void` needed — `commitEdit` isn't async); a new `onRequestSave` callback calls `void application.pageOperations.requestSave(pageId)`.

**Tests to add/update:**
- Component-level tests for `MarkdownEditor`: typing (simulated input events) calls the new commit callback with the current content on each event (or per the chosen coalescing interval); blur calls the new flush callback with no arguments (verifying the payload-free contract from §0 is honored at the UI boundary, not just internally).
- Integration test (or the closest existing equivalent in this codebase's test setup) exercising the full path: type into the editor, blur, assert the underlying `PagePersistenceCoordinator` mock received exactly one `save`-kind enqueue with the typed content — this is the first test in the roadmap that exercises the entire stack end-to-end, and it's the direct executable form of `autosave-execution-model.md` §4.2's worked example.

**Risks:** This is the milestone most likely to surface a UI-layer assumption the earlier, backend-only milestones couldn't catch — e.g., a place in the UI that reads `DocumentSession.isDirty`/`.state` expecting a save to only ever have been triggered by blur (timing/ordering assumptions baked into a "Saving..." indicator, for instance). Per the project's own standing instruction, this milestone should be manually verified in a running browser (start the dev server, type in a note, observe blur-triggered save behavior, confirm no regression in the existing save-state UI indicator), not just unit-tested — this is explicitly a UI/frontend change and the golden path must be exercised live before considering it complete.

**Verification steps:**
1. `tsc` clean.
2. All new and existing component/unit tests green.
3. Full test suite green.
4. **Manual browser verification (required, not optional, per this project's UI-change standard):** start the app, open a note, type, blur, confirm the content saves (check the file/Vault state or the existing save-indicator UI); switch away without blurring (if any such path exists in the current UI) and confirm content is *not yet* auto-saved at this point in the roadmap (M7 adds navigation-flush next) — this negative check is what proves M6 didn't accidentally do more than its stated scope.
5. Confirm no regression in existing manual-save/archived-page/draft-promotion flows, which continue to call `save()` directly and are untouched by this milestone.

---

## M7 — Navigation-triggered flush

**Objective:** Implement `autosave-execution-model.md` §2's T5 — a save request for the outgoing session, issued before `Workspace.openPage`/`closePage` is called during navigation, per `autosave-ownership.md` §7's placement (above `Workspace`, never inside it).

**Files expected to change:**
- The existing navigation call site(s) that lead into `Workspace.openPage`/`closePage` — per earlier analysis, most likely inside `PageOperations.open()`/`openDraft()`/`openAtPath()` (for opening a *new* page, which implicitly navigates away from whatever was previously active) and/or `NavigationRouter`'s call sites. **Exact call site(s) to be confirmed against current source at implementation time** — this wasn't independently re-verified path-by-path in this conversation the way `PageOperations.ts`/`Workspace.ts` were.

**Public API changes:** None — `Workspace.openPage`/`closePage` remain untouched (per spec §10's synchronous, zero-dependency invariant, re-verified during the validation pass), consistent with `autosave-ownership.md` §7's ruling that `Workspace` cannot and must not be where this logic lives.

**Internal refactors:**
- Wherever the UI/application layer currently calls `workspace.openPage(newId)` when switching the active page, precede that call with `this.requestSave(previousActivePageId)` (read from `workspace.activePageId` *before* the switch) — fire-and-forget, per §1 of the strategy analysis' recommendation that navigation not block on the outgoing save's completion (optimistic navigation: the UI switches immediately, the flush happens in the background against the now-inactive session).
- This is the one milestone where the "exact call site" question has real weight — per `autosave-ownership.md` §7, the requirement is that *every* way of switching the active page triggers this, not just the most obvious one, so this milestone's actual work is partly investigative (enumerate every current call site that changes `workspace.activePageId`) before it's implementation.

**Tests to add/update:**
- A test simulating "page A active and dirty, user opens page B," asserting `requestSave()` was called for A's id before `workspace.activePageId` becomes B (ordering matters — verify via mock call-order assertions, not just "was called").
- A test confirming navigation itself is not blocked/delayed by the outgoing save — the new page becomes active synchronously/immediately regardless of whether the outgoing flush has resolved (assert `workspace.activePageId === B` before the outgoing `save()` mock's promise has resolved).

**Risks:** The main risk is incompleteness — missing one of several call sites that can change the active page (a keyboard shortcut, a search-result click, a backlink click) would leave a silent gap where navigation-triggered save works for the common path but not all of them. Mitigate by grepping for every call site of `workspace.openPage`/`.openFolder` before starting, not just the one exercised by manual testing.

**Verification steps:**
1. `tsc` clean.
2. New tests green, full suite green.
3. Enumerate (in the PR description, not just in code) every call site that changes the active page and confirm each was updated — a checklist specific to this milestone, since "did we get all of them" isn't something `tsc`/tests alone can confirm without deliberately exercising each path.
4. Manual browser verification: edit a note without blurring in a way that still leaves it dirty, navigate to another note via at least two different UI paths (sidebar click, keyboard shortcut if one exists), confirm the first note's content persisted both times.

---

## M8 — Shutdown flush

**Objective:** Implement `autosave-execution-model.md` §7's complete shutdown sequence: `PageOperations.flushAll()`, enumerating `DocumentRegistry.getAll()`, issuing `requestSave()` for every dirty session and awaiting any already-`Saving`, in parallel, bounded by a timeout, called from the Composition Root's `Application.close()`.

**Files expected to change:**
- `apps/app/src/core/application/page/PageOperations.ts`
- The Composition Root (`Application.ts` or equivalent — **path to be confirmed against current source**, not independently re-verified in this conversation the way `PageOperations.ts` was).

**Public API changes:**
- `PageOperations` gains: `flushAll(timeoutMs: number): Promise<void>`. Per §7 step 3: enumerates `documentRegistry.getAll()`, filters to sessions where `state === 'Saving'` or `isDirty === true`, and calls `requestSave()` uniformly for each — all via `Promise.allSettled`, never sequential `await` in a loop, so one slow/failing session never delays another's successful flush (per §7 step 3's explicit requirement, mirroring the Gate's own per-page failure isolation). Bounded by `timeoutMs` (a `Promise.race` against a timer, or an equivalent bounded-wait primitive) so a single hung write can never block application exit indefinitely.

**Prerequisite change to `requestSave()` itself, found during M4's final audit — required before `flushAll()` can be built correctly:** `requestSave()`, as shipped in M4, does not let a caller await an *already-in-flight* save. If `flushAll()` called `requestSave()` for a session already `Saving` (because some earlier trigger's call — e.g. a debounce timer, never awaited by anything — is still looping), `evaluate()` correctly returns `'suppress'`, and *that specific call's* promise resolves immediately, without waiting for the real save to actually finish. `flushAll()` would then wrongly conclude the session was flushed while a write was still genuinely in progress — a silent violation of §7's shutdown-wait guarantee. **Fix, to be made in M8 (touching `PageOperations.ts`, the file M4 introduced `requestSave()` in — this is a normal extension of an existing method, not new architecture):** `requestSave()` tracks its own in-flight promise per session id in a small private map, and any concurrent caller for the same id — including a fresh call from `flushAll()` — receives and awaits the *same* promise instead of running an independent loop iteration that immediately suppresses. This is a strict improvement, not just an M8-specific patch: any two concurrent triggers for the same session now genuinely join one real save rather than one silently returning without the caller knowing whether the underlying work is actually done. With this fix, `flushAll()` needs no special-casing between `Saving` and dirty-but-idle sessions at all — it calls `requestSave()` uniformly for every session matching either condition, and correctly awaits the real completion either way.

**Internal refactors:**
- Composition Root: `Application.close()` calls `await this.pageOperations.flushAll(SOME_TIMEOUT_MS)` before its existing `watcher.stop()`/teardown sequence — per spec §11's invariant against conditional business logic in the Composition Root, this is a single, unconditional call, not a branch. The specific timeout value, like M5's debounce/ceiling constants, is a placeholder pending a product decision (`autosave-strategy-analysis.md` §7 Risk 2) — pick something generous but finite (e.g. a few seconds) and label it clearly as tunable.
- If `Application.close()` is not already `async`/awaited by its own caller (verify against current source — the spec describes it as synchronous, `close(): void`, in §11's public API listing), this milestone may need to promote it to `async close(): Promise<void>` and confirm its own caller (whatever triggers app shutdown — a Tauri close-requested handler, not yet identified in this conversation) can actually await it and, more importantly, can actually *delay* the OS-level close event on that await — this is flagged as a real open question in `autosave-execution-model.md` §7 step 3's own text ("Tauri's own before-close event model needs to actually support blocking exit — needs verification during implementation, not assumed here") and should be the first thing confirmed in this milestone, before writing `flushAll()` itself, since if blocking exit isn't achievable, the whole milestone's shape needs revisiting as a implementation-time discovery (per `implementation-rules.md` §4's divergence process — not a silent workaround).

**Tests to add/update:**
- `requestSave()`'s new in-flight-promise-sharing behavior (the prerequisite fix above): a test using the `GatedVaultFileSystem`-style pattern from M4's own test suite — start a save, hold its Gate write open, call `requestSave()` again for the same id while it's held, and assert the second call's promise does not resolve until the first (real) write is released and completes. This is the test that would have caught the gap this audit found, had it existed in M4.
- `PageOperations.flushAll()`: a test with three sessions (one `Saving`, one `Clean`-and-dirty, one `Clean`-and-not-dirty) asserting exactly two flush operations occur (the third is excluded) and both run concurrently, not sequentially (assert via mock timing/ordering, not just call count).
- A test asserting one session's save failing (mock rejection) does not prevent another session's save from completing successfully — `Promise.allSettled` semantics, verified directly.
- A test asserting `flushAll()` resolves once the timeout elapses even if a save is still pending (fake timers again, per M5's established pattern) — confirming the bounded-wait requirement.

**Risks:** This milestone carries the same open platform question `autosave-execution-model.md` §7 itself flagged rather than resolved — whether the app's actual close event can be delayed at all. If it can't be, `flushAll()` as specified still has value (it maximizes the chance pending saves complete within whatever grace period exists) but the "shutdown waits" guarantee from §7 step 3 would need to be revisited as a documented, disclosed limitation rather than a broken promise — this should be confirmed and reported explicitly in this milestone's PR description, not discovered later.

**Verification steps:**
1. `tsc` clean.
2. New tests green, full suite green.
3. Confirm (and document in the PR) whether the platform's close event genuinely supports blocking — this is a factual finding to report, not an assumption to carry forward silently.
4. Manual verification: edit a note without blurring or navigating away, close the application, reopen it, confirm the edit persisted (this is the closest thing to an end-to-end test of the entire roadmap, since it exercises commit → debounce-or-shutdown-trigger → coalescing → Gate write → disk, across M2 through M8 all at once).

---

## Summary — dependency graph

```
M1 (Disposed wiring)         ─┐
M2 (commit-only method)      ─┼─► M4 (requestSave, restart, sync-failure) ─► M5 (timers) ─► M6 (UI wiring) ─┬─► M7 (navigation flush)
M3 (coalescing algorithm)    ─┘                                                                             └─► M8 (shutdown flush)
```

M1-M3 have no dependencies on each other and could, in principle, be done in any order or even in parallel by different reviewers — they're sequenced M1→M2→M3 above purely for narrative clarity (foundational → commit → decision), not because of a hard ordering constraint. M4 depends on all three. M5 depends on M4 (timers fire into `requestSave()`) and M2 (timers are armed from `commitEdit()`). M6 depends on M2, M4, and M5 all existing and tested, since it's the first milestone that makes them reachable from a real user action. M7 and M8 both depend only on M4 (`requestSave()`) and M1 (for M8's enumeration to correctly reflect disposed sessions) — they do not depend on each other and could be done in either order or in parallel once M6 is merged.

Every milestone through M5 leaves the running application byte-for-byte behaviorally identical to today (new methods exist, are tested, are unreachable from the UI). M6 is the first milestone that changes what a user actually experiences, and by that point every piece of logic it wires together (commit/request/coalesce/restart/timer) has already been independently verified in isolation — M6's own risk is therefore narrowed to "is the wiring correct," not "is the underlying logic correct," which is exactly the incremental-risk shape this roadmap is designed to produce.
