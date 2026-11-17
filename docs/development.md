# Development

Use `/Users/sivakuv3/Documents/Personal/projects/Clutter Structured` on
`architecture/clutter-foundation`. The `Clutter Markdown` worktree is `main`, the
existing application. They share Git history, not checked-out files/dependencies.
Do not merge/push/main-switch as part of routine rebuild work.

Install with `npm ci --ignore-scripts`. Root lock contains only the five new
workspaces and their exact reachable dependencies. No CM6/Lezer/Markdown parser,
legacy Tauri frontend plugins or old automation stack is required. Do not run a
blanket npm audit fix or install a new dependency graph to hide a missing lock entry.

| Command | Purpose |
| --- | --- |
| npm run desktop | Build/launch the new Tauri product entry on macOS ARM64 |
| npm run desktop:reopen | Reopen its same saved development Space/bundle |
| npm run desktop -- --new | Explicit different disposable Space after source changes; prior locator retained |
| npm run desktop:check | Facts-only platform/bootstrap requirements; no compilation/pass inferred |
| npm test | Core/editor/storage/transport/React integration tests; Node24.22.1 |
| npm run typecheck | Strict Core/runtime TypeScript checks |
| npm run check:boundaries | Package directions, retired source/dependency absence |

The native runner bootstraps checksum-pinned Node24.22.1, requires the previously
verified existing Rust1.90.0/Xcode environment, copies exact checked-in native
manifests/locks, uses npm ci and locked Cargo acquisition then locked/offline compile.
Its generated projects, runtime, bundles and locator live under Git metadata
clutter-structured53; nothing under node_modules/build outputs is source evidence.
No old experiment project/report/cache is required. Native dependency root crate names
remain the exact exported locked identity; this is one host, not a second app.

This delivery deliberately uses a fresh Structured development locator rather than
adapting old proof session paths or data. Old synthetic sessions are left untouched.
It does not migrate notes or reinterpret historical private metadata. Reopen only
after this entry has successfully launched once. Explicit --new is needed to compile
source changes if a previous Structured locator already exists.

Initial verification on Mac: create two pages, type distinguishable text in each,
switch back, close safely and reopen with npm run desktop:reopen. Confirm the same
pages/text. Do not replay old profiler/qualification suites. Native build, window
lifecycle and editor behavior are only claimed after actual observation.

R1 is a development slice. Current title is Untitled (title editing is next); page
list/create/open and paragraphs are implemented. The rest of editor/feature UI,
actual installed storage paths/permissions/single-owner discovery, final format,
Windows/browser compositions, scale and release/distribution remain tracked.
