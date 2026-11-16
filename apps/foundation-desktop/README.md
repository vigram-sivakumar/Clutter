# Disposable Foundation development composition

This is an integration checkpoint, not a replacement design for Clutter. Existing
apps/app and its UI/pipeline are unchanged. The next product step is to discuss
reusing its presentation while replacing the old architecture completely.

Root: npm run foundation:desktop (macOS ARM64, existing Rust1.90.0/Xcode and verified
prior Tauri build locks). It prepares pinned Node24.22.1 automatically, builds only
in Git metadata and opens a synthetic disposable Space. No global toolchain changes.
Use foundation:desktop:reopen to reopen the same session; explicit --new preserves
old locators and creates a different test Space. No real notes or automatic fresh
replacement. No source runtime cache/binaries/reports are staged.

Root npm ci --ignore-scripts installs the two new workspace links. Direct external
dependency versions stay unchanged. This runner's initial native-lock seed is from
completed prior build2026-11-16T10-35-45-751Z-5b4941c3, verified read-only. Capture its
new lock derivatives before an independently reproducible product build is claimed.

Shared UI/controller is packages/foundation-ui, all document operations use existing
foundation-runtime. Node headless owner uses packaged runtime and outlives the window.
Private loopback reservation is developer-scoped, not installed registry/security
qualification. Idle shutdown and full distribution/feature UI are still pending.

Mac build/native observation is not inferred from Linux tests. See
[handoff](../../docs/foundation/START-HERE.md), [composition](../../docs/foundation/i2/desktop-composition.md)
and [rebuild proposal](../../docs/foundation/i2/rebuild-plan-proposal.md).
