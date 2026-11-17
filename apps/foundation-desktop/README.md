# Disposable Foundation development composition

Temporary integration composition; not the final Clutter product UI. Clean rebuild
R1 will replace this entry and retire the old apps/app CM6/Markdown pipeline. See the
[active plan](../../docs/foundation/rebuild/README.md) and
[handoff](../../docs/foundation/START-HERE.md).

Run in the Clutter Structured worktree on architecture/clutter-foundation. Clutter
Markdown/main is independent. Root npm run foundation:desktop requires macOS ARM64,
existing Rust1.90.0/Xcode, and network for missing locked dependencies. It prepares
pinned Node24.22.1 without global toolchain changes and builds in Git metadata.
Checked-in tools/native-locks contains exact user-exported manifests/full locks with
SHA256 provenance. No earlier experiment build/report/cache required. Native npm uses
ci; Cargo uses locked acquisition then locked/offline compilation. Missing dependencies
are not evidence that a different version is acceptable. Fresh Mac build not run by52.

foundation:desktop:reopen opens an existing session/bundle; explicit --new preserves
old locators and creates a different disposable Space. Source changes require a new
bundle. No52 native rerun requested. Moving a worktree does not rewrite historical
absolute session locators. Never silently reset a session after relocation failure.
No source runtime cache/binary/report is staged. No real notes yet.

packages/foundation-ui owns temporary shared UI/controller; foundation-runtime owns
all document operations. Packaged headless owner outlives the window. Private loopback
reservation is developer-scoped, not installed security qualification. Idle shutdown,
full product UI and data-bearing/distribution gates remain pending. Mac compilation
and native observation are not inferred from Linux tests.
