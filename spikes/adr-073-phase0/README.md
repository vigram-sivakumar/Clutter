# ADR-073 coordination validation

This is a throwaway spike and validation harness. It is not linked into Clutter and does not enable New Window.

## Run the next check on a Mac

Prerequisites: the `spike/adr-073-phase0` checkout with the history and coordination patches applied, Python 3.9+, Rust/Cargo and Xcode Command Line Tools.

From the Clutter repository root:

```bash
python3 spikes/adr-073-phase0/run_phase0.py --profile quick
```

The runner builds the real crash worker and executes the implemented native experiments against the real macOS atomic writer. It uses a private temporary tree under `packages/automation/reports/adr073-phase0/<run>/scratch`; it never opens your Clutter Spaces or application settings. It checks both the test inventory and the executed-test summary, so an empty, filtered-out or all-ignored test run cannot pass.

It prints the location of `phase0-report.zip`, containing `summary.json`, environment/commit information, and the build/list/test logs. Share that ZIP for the next review. A failed test is useful evidence; keep the report rather than retrying repeatedly or changing assertions to make it green.

**Exit code 0 means only the implemented quick subset passed.** `phase0_complete` and `native_window_matrix_passed` remain false. The current subset has 36 native experiments: quick executes 33 and leaves the three deliberately long stress tests ignored. The initial build can take longer than subsequent runs; the runner gives each quick command a 15-minute timeout and terminates its process group on timeout or interruption.

The long profile is available for a later, deliberate stress run:

```bash
python3 spikes/adr-073-phase0/run_phase0.py --profile full
```

This includes 15,000 mutation intents, 500 SIGKILL cycles, and 1,000 remove/relocate interleavings with jitter. It is restricted to `experiments::`, so it does not enable the atomic writer's separate destructive volume-fill tests. Each command has a two-hour timeout. **Even if this subset passes, full exits 2 while the missing integration/platform gates remain unimplemented.** Do not interpret it as a completed Phase 0.

## Retry only the crash/durability checks

After the full-run report identified a crash-harness failure, the focused retry avoids repeating the successful 15,000-intent and 1,000-interleaving tests:

```bash
python3 spikes/adr-073-phase0/run_phase0.py --profile crash
```

This runs all seven E2 tests, including **500 SIGKILL cycles**, without ignoring any E2 test. The crash loop prints progress every 50 cycles. Success means only this E2 subset passed; the summary identifies that scope and still reports Phase 0 incomplete. Like the full profile, it enforces 500 kills and a two-hour per-command timeout. Share the new `phase0-report.zip` even if it fails.

## Portable checks

The shared evaluator has no I/O. The native store uses that exact implementation; there is no second registry policy for tests.

```bash
cargo test --locked --manifest-path spikes/adr-073-phase0/Cargo.toml --lib model::tests
cargo test --locked --manifest-path spikes/adr-073-phase0/Cargo.toml --lib crash_checks::tests
python3 -m unittest discover -s spikes/adr-073-phase0 -p 'test_run_phase0.py' -v
```

These commands run on Linux too. They do not prove native durability, leases across real windows, watcher delivery, WKWebView behavior, or development/packaged/sandboxed app behavior. The native runner refuses non-macOS hosts.

See [the coordination checkpoint](./COORDINATION-CHECKPOINT.md) for findings, coverage limits and remaining gates, and [the earlier editor-history results](./RESULTS.md) for the separate history fixes.
