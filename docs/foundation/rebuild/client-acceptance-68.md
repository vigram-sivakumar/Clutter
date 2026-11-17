# Real client acceptance68

17 November2026. Verification-only delivery after user67 scoped separator PASS.
No editor feature/native/dependency/build change. Use the already open67 synthetic
app and its current session. No npm install or desktop --new command for this check.

## First step

Run `node tools/check-clients.mjs --prepare` from Clutter Structured.

The runner creates ONE synthetic note titled **Client check 68** through the current
bundle's real CLI, updates via MCP after initialize/tools-list handshake, checks CLI
and MCP each reject stale expectedHead with CONFLICT and unchanged accepted root,
then updates via CLI and reads identical accepted roots through both clients.
It uses the existing bundled launcher/runtime/owner, not source adapters/test mocks,
direct HTTP commands, SQLite writes, a fallback service or another access connection.

In the test app click **Refresh pages**, open **Client check 68**. Confirm title and
three body lines: CLI CREATED, MCP UPDATED, CLI UPDATED. Append **UI VERIFIED** at the
body bottom without removing existing text; click Save. Return the scoped result.
The runner has not established visible UI convergence merely by writing the note.

## Next steps after that observation

1. Run `node tools/check-clients.mjs --verify`. Both clients must read all original
   markers plus UI VERIFIED in the BODY and the same accepted head/document.
2. Close the test app window using the red button, then `npm run desktop:reopen`.
   Do NOT use --new, which creates another synthetic Space. Confirm the same note,
   all four markers and its saved content remain visible.
3. Run `node tools/check-clients.mjs --verify-reopen`. Requires earlier save verification,
   same bundle/Space/session, old recorded window process gone, a different live
   process in latest locator and unchanged accepted document through both clients.
4. Return result AND visual reopen observation. That closes this dedicated Mac client
   milestone; proceed to already-agreed formatting. No host benchmarking restart.

Do not type extra content between verify and verify-reopen; unchanged head is part
of the check. Changed accepted head is reported accurately, not silently replaced.
If another original window is still open, close it normally before checking reopen;
the helper does not terminate processes or bypass native pending-work protection.

## Reports and failure handling

Private plans/reports are under Git metadata clutter-structured53/client-check68,
keyed by bundle/Space/session identity. The unique test target is persisted before
mutation; repeating prepare refuses rather than creating more notes. A failed or
interrupted preparation remains visible for diagnosis, not an automatic retry into
another target. Existing notes and earlier sessions are not cleaned up or modified.
No generated report/token/real note content enters Git or the source patch.

Missing UI marker fails verify. Calling reopen verification before replacing the
window process refuses. Reopen verification proves the process replacement and
accepted root; actual native visual restoration is still an operator observation.
Owner is retained: no owner restart, installed-data durability/security/scale or
Windows/IME/shipping claim. Saved SQLite/owner restart regressions remain separately
tested; do not label this check as a new native disk-recovery qualification.

## Evidence and mandatory completion review

One new Linux end-to-end runner test PASS through real bundled CLI/MCP processes,
headless owner/Core/SQLite and actual React/PM save/context close/reopen. Stale CLI
and MCP writes leave accepted root unchanged. It also checks no marker/no reopen and
repeat-prepare refusals, preservation of an unrelated note and summaries free of
session credentials. Native PID transition guards use disposable stand-in processes,
not Mac window automation. Strict Core/runtime TS and51-source boundaries PASS.

Only development helper/test/docs change. No product/schema/contracts/native/runtime
source/dependency/lock changes; no full-suite replay needed or claimed. Superseded
pending-next-step docs updated, no alternative semantic writer/owner introduced.
The helper constructs synthetic fixtures using the existing shared schema helper;
all reads/writes go through real peer clients on the accepted Core path. Current
scope fulfills the every-change architecture/client review without changing UI UX.

## Actual Mac result — PASS,17 November2026

User supplied verify and verify-reopen JSON: CLI/MCP read/write, both conflicts,
UI marker and accepted-root equality PASS; windowProcessReplaced true. Before/after
screenshots show Client check68 with all four expected body lines including UI
VERIFIED. Dedicated Mac client save/window-context reopen milestone is complete.
Owner was retained; no owner restart/disk-recovery claim. Proceed to agreed formatting.
Observation docs are queued for the next delivery after68; no code or tests changed.
