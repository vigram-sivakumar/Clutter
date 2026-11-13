# Coordination validation checkpoint

Recorded 2026-11-13 on `spike/adr-073-phase0`, based on `81f4ff8` plus the preceding editor-history patch and this coordination update. Nothing here enables additional product windows or marks ADR-073 accepted.

## What actually ran

| Check | Result | Scope |
|---|---|---|
| Shared Rust evaluator tests on Linux | **18 passed**, no ignored/expected failures (13 evaluator + 5 crash-validation tests) | Actual serialization and decision logic called by the native store; no disk durability or IPC |
| Python runner contract tests | **11 passed** | Empty-suite prevention, required coverage, full/quick distinction, wrong-host rejection, Cargo worker discovery and real timeout cleanup |
| Apple Silicon `cargo check --all-targets` | **Passed** | Compile-check of native store, experiments and worker for `aarch64-apple-darwin`; not a linked or executed app |
| Intel Mac `cargo check --all-targets` | **Passed** | Same for `x86_64-apple-darwin`; not native execution |
| Corrected native quick run on macOS (uploaded report) | **33 passed, 0 failed, 3 ignored** | The corrected restart comparison passed |
| First full native run on macOS (uploaded report) | **35 passed, 1 failed, 0 ignored** | 15,000-intent and 1,000-interleaving stress passed; crash harness panicked on a missing generation lookup |
| Development/packaged/sandboxed Tauri windows | **Pending** | No native multi-window fixture has been implemented or run |

The compiler reports the spike's existing unused `notify` dependency; no dependencies were added or upgraded. TypeScript product code is unchanged by this coordination update, so the preceding history patch's TypeScript/browser results remain separate evidence, not results of a new run.

## First native report and focused correction

The uploaded quick report (`20261113T141235Z`, arm64 macOS) ran all 33 non-ignored native checks: 32 passed and `e1_stress_quick` failed. The three long stress tests remained deliberately ignored. The E1 test reached its final restart comparison after its acknowledged-update, revision-order, notification-order and uniqueness assertions passed. Both printed documents were at revision 671. Comparing the two complete debug payloads shows every field identical except `checksum`: the parsed disk document carries its verified SHA-256; the live document leaves that field empty because `to_bytes` seals a copy.

The correction keeps the integrity check: first compare the actual `registry.json` bytes to the complete canonical live document, then reopen through the normal validating recovery path and compare its complete canonical bytes to the bytes read from disk. It does not skip E1, discard payload fields, change equality globally, disable checksum validation or modify registry behavior.

A portable regression now verifies canonical equality across live/parsed representations, serialization's input immutability, detection of a changed registry payload, and rejection of a bad stored checksum. All 13 portable tests and 10 runner tests pass; macOS-target compiler checks pass for both architectures. The subsequent uploaded quick report confirmed **33 passed, 0 failed, 3 ignored**. The earlier failing report is retained as historical evidence; Phase 0 remains incomplete.

## First full native report and crash-harness correction

The full report (`20261113T142251Z`) completed in 466.86 seconds: **35 passed / 1 failed / 0 ignored**. The three-thread 15,000-intent test passed with 10,573 committed revisions, and the 1,000 remove/relocate race passed. The sole failure was `e2_kill_minus_nine_at_random_instants` at the unconditional `disk(...registry.json).unwrap()`.

That helper converted missing files, read errors and invalid documents alike into `None`; the log did not record the cycle or file contents before the unwrap. The report therefore cannot establish a data-loss cause from that panic. In particular, a kill before the very first commit legitimately leaves no registry generations, while the test assumed both always existed.

The corrected harness distinguishes `NotFound` from other read errors, requires successful writable startup recovery, and validates both recovered generations explicitly. Only a fully empty revision-zero snapshot with no previously acknowledged or recovery-confirmed revision can have both files absent. A missing single normalized generation, damaged checksum, invalid generation order, different payload, or regression below the confirmed revision floor still fails. Complete ACKs remain checked; a torn final stdout line is not treated as an acknowledgement. The previously recovered revision is tracked separately from the highest ACK, and at most one unacknowledged revision may have landed. Progress is printed every 50 kills.

Five portable crash-validation tests exercise these boundaries, including rejection of a lost confirmed revision and corrupted generations. All **18 Rust tests and 11 runner tests pass** locally; both Mac target compiler checks pass. The native 500-cycle retry remains pending. Run `python3 spikes/adr-073-phase0/run_phase0.py --profile crash` to execute only the seven E2 durability/crash tests, including 500 kills, and share the new report. This does not repeat the already successful E1/E5 long stress tests, and it does not complete the still-missing integration/platform gates.

## Findings and changes

1. **One evaluator, exercised directly.** The existing serializable registry types and pure `apply` evaluator moved from `store.rs` to `model.rs`. The macOS store imports and re-exports those types and calls the same evaluator. Linux tests do not use a substitute writer or a duplicate registry implementation. The existing native commit pipeline still owns revision assignment, retention, flushes and publication.
2. **Three reproduced authorization defects.** Before the fixes, three portable tests failed: a claim for `/A` could authorize a new `/B`, another window could use a holder's token, and a loss episode for one Space could be published against another Space. The shared evaluator now checks target path, holder, fence and expiry, and the exact launch/path/reopen-epoch loss key. These tests now pass.
3. **Stale identity for last-opened changes.** `SetLastOpened` now includes the Space id and checks it even when the path is already current. A stale window cannot mutate the registry entry that replaced its old Space at the same path. The native stress harness was updated to supply identities. This is an experimental Rust intent change; no product IPC command has been added.
4. **Reopen/launch fencing.** Portable tests verify that a loss key from an earlier reopen is refused. Native E6 additionally checks a new launch and refuses the previous launch's key. The launch identifier no longer truncates time to a one-millisecond repeating range; it combines process identity, time and a monotonic per-process sequence. The first native quick run passed the E6 restart/epoch checks.
5. **Startup publication.** Code review found that failed normalization still published the adopted startup document. The spike now remains read-only without publishing that unconfirmed snapshot. E3 contains the required assertion; its filesystem/fault assertion passed in the uploaded native quick run.
6. **Legacy import shares policy and persistence.** Legacy relocation now goes through the shared Replace evaluator so last-opened follows the same identity. Ordinary intents and legacy changes use one native `commit` helper, including bounded operation retention and indeterminate-outcome reconciliation. Degraded mode refuses legacy mutation too. Importing an old build's addition does not count as opening it in a current window.
7. **An existing baseline is not automatically durable.** If a baseline rename landed but its flush was unconfirmed before the first registry commit, retry must confirm its exact bytes rather than trusting existence. The spike now performs that confirmation before first adoption. E9 tests the failure/retry path; it passed in the uploaded native quick run.

The origin passed to the evaluator is a trusted native caller identity. Future Tauri commands must derive it from the calling window, rather than accepting a webview-supplied label. Canonicalization, filesystem permissions and provisioning admission must likewise be enforced at the native boundary. These pure tests do not establish those future command guarantees.

## Native coverage now present

There are **36 native experiments** in the implemented subset. Quick runs 33; full additionally runs three deliberately long stress experiments. This count does not mean all ADR experiments are implemented.

| ADR experiment | Current coverage | Still missing |
|---|---|---|
| E1 | Existing three-window quick/full stress and slow-writer read test | Specified development/packaged/sandboxed platform runs |
| E2 | Existing fault matrix, outcome/order checks and SIGKILL worker | Corrected 500-kill retry passed in the uploaded macOS crash report; power loss is not simulated |
| E3 | Adoption table, normalization, checksum/invariant damage, quarantine, baseline/recovery-byte preservation, future schema, failed normalization and orphan preservation | Fixture disk images do not replace real crash testing |
| E4 | Three claimant threads, heartbeat/expiry/takeover fencing, window destruction and wrong-target rejection | Fenced welcome ledger, late already-issued provisioning writes and real window destruction |
| E5 | Stale operations, reused path with wrong identity, removed fallback, and remove/relocate race (12 quick / 1,000 full) | The rest of the ADR conflict matrix at its required repetition counts |
| E6 | Concurrent loss publishers, target/reopen/launch fencing, ordered and idempotent notice replay | Real window notice consumers |
| E7 | Snapshot replay with dropped/duplicated/reordered signal hints; stable-id lookup after notice retention | Actual frontend backstop timers, hidden/resume transitions and Tauri delivery |
| E8 | Production recovery IO/catalog and real journal component tests now cover metadata, injected live-session filtering and protection races (see tabs-foundation.md) | Native liveness binding, real transitions and old-binary compatibility acceptance |
| E9 | Immutable baseline, no resurrection after re-upgrade, rename identity/last-opened, interrupted first import and unconfirmed baseline retry | Remaining full migration/corruption/three-window scenarios |
| E10/E11/E12 | Explicitly pending modules | Native destination claim, unflushable-window transition/retry and platform/build matrix |

E7 uses the existing pure follower helpers as a replay model. It is not a frontend implementation, and a model's success cannot prove timed convergence of real windows. The native store is still throwaway spike code, separate from Clutter's production build.

## Run on a Mac

Apply this coordination patch after the editor-history patch, on `spike/adr-073-phase0`. From the repository root:

```bash
python3 spikes/adr-073-phase0/run_phase0.py --profile quick
```

The runner needs Python 3.9+, Rust/Cargo and Xcode Command Line Tools. It builds the worker, obtains its exact executable path from Cargo's artifact output, checks the native test inventory, and runs only `experiments::`. Logs and temporary test Spaces stay under an isolated ignored report directory. It does not open a user's Clutter Spaces or application settings.

Share the printed `phase0-report.zip`. It contains build/list/test logs, compiler/OS/commit information and machine-readable status. Even when the quick subset passes, `phase0_complete` and `native_window_matrix_passed` remain false. The full profile deliberately returns a nonzero gate result while required integration/platform coverage is absent. No empty or all-ignored run can pass the runner.

For portable reproduction:

```bash
cargo test --locked --manifest-path spikes/adr-073-phase0/Cargo.toml --lib model::tests
cargo test --locked --manifest-path spikes/adr-073-phase0/Cargo.toml --lib crash_checks::tests
python3 -m unittest discover -s spikes/adr-073-phase0 -p 'test_run_phase0.py' -v
```

The original history work remains isolated and uncommitted. This update adds no new dependency, no product New Window command, and no native capability grants. Nothing has been committed or pushed. G1–G3 remain open; do not expose the product feature until the required native evidence exists.
