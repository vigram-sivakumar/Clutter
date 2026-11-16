# NEW Core28 native qualification

Synthetic disposable data only. This is not the existing Clutter app, old joined
lab, accepted production shell, general PDF decoder or full durability qualification.
The four targeted cases live in ../native-contract.json; the Mac UI loads that same
file. Initial manual status remains not-run until actually observed.

From repository root, Node24.22.1+ with normal root and existing nested PM/Y/esbuild
locked dependencies installed:

```bash
npm run native:core28
```

Requires macOS14+ and Xcode command line tools. First run may download the checksum-
pinned official Node archive (or reuse/verify the old cached archive). It bundles
browser-safe views and the actual Core, compiles Cocoa/WKWebView/PDFKit, signs the
nested runtime then outer app and verifies the bundle. Ad-hoc signing is not
notarization, sandbox, distribution or production security acceptance.

Stop at **Ready** and report launch/compiler errors before marking cases. Then run
NC28-01 only when guided. The four cases cover two-view/history/remount, image/cover/
native PDF, media journal/close failure and protected text/app-closed CLI. No broad
old table/keyboard/manual replay. Use synthetic samples only, no private files.

Close/reload waits for media actions admitted before the guard, journals exact
media commands+bytes, and calls editor prepareClose. If the journal and saves/
protection fail, close refuses and the view remains live. Protected media may still
have a conflict/validation failure; it is retained, never rebased/dropped silently.
Clear fault flags and retry. Full conflict-resolution UI/retention is not implemented.

Same-session recovery after closing:

```bash
npm run native:core28:reopen
```

This reuses the original bundle/store, verifies integrity/signature and refuses a
second live window. Normal `native:core28` refuses an existing session; an explicit
`npm run native:core28 -- --new` creates a separate synthetic Space and archives the
previous locator. Do not use --new to recover lost-looking work. Old joined/native
sessions are untouched. Protected text recovery is explicit via Recover protected A.
Owner restart resets interactive undo deliberately; it does not erase accepted data.

Generated apps/runtime caches/setup/manual reports live under the Git-internal path
`git rev-parse --git-path clutter-native28`, which cannot be staged on any branch.
They are not in docs/foundation source. Native UI **Show report** reveals the manual
report. Setup locator is artifacts/latest-session.json inside that Git-internal
folder; failed attempts retain the last valid session and archive prior setup.
Reports exclude bootstrap tokens/private descriptors. Never share endpoint.json.
Synthetic service/store/journal directories are private OS-temp directories and may
be removed by OS cleanup; these are not production durable user vaults.

The terminal prints an exact, fully quoted app-closed CLI read and stop command.
CLI/MCP are peers using the same running Core, not a UI business-logic subprocess.
The native shell uses the launcher only for bootstrap/lab controls. SQL exclusive
writer + private session bootstrap are bounded checks, not production alias/fencing/
peer auth lifecycle guarantees.

Images use view-owned Blob URLs revoked on replacement/detach. PDF preview goes via
an origin-checked native bridge to PDFKit using Core-read, SHA-verified fixture bytes;
there is no iframe/direct filesystem URL. This is not a PDF security certification.
Broader formats, inline media placement, IME/accessibility/layout, production host,
native file fullsync/power loss, migration/retention/GC and D11 budgets remain gated.
SQLite fullfsync/checkpoint_fullfsync are configured/checked on Mac; profile still
says nativeDurabilityQualified:false. A failed/broken bootstrap never enables editing.
Volatile input lost in a web-content process crash is NOT inferred recovered.
