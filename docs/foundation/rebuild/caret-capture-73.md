# Native first-click caret capture73

17 November2026.72 did not resolve actual native symptom. Exact repro from user:
delete ALL body blocks; first click gives2–3 rapid caret blinks then normal. Later
clicks are normal. Keep no-caret after deletion; this capture does not change that UX.

## Run in existing72 app/session — no rebuild

1. Close the current test window with red button normally (existing pending-work guard).
2. Apply/stage/commit73. Run `CLUTTER_CARET_TRACE=1 npm run desktop:reopen`.
   Do not use --new. The existing host initialization-script mechanism injects the
   observer while browser/native bundle hashes, owner and Space stay unchanged.
3. In reopened note put some body text ready BEFORE starting trace.
4. Expand bottom-right **Caret trace (development)**. Read these steps first, then
   click **Start 12-second trace**.
5. Click body text; Cmd+A twice; Delete. Click empty body ONCE. Leave mouse/keyboard
   alone and watch first caret blinks until panel says capture complete.
6. Click **Copy trace** and paste into chat. If clipboard API unavailable, the report
   textarea is selected; press Cmd+C manually. State whether rapid blink happened.

One short pilot, not a new benchmarking/research sequence. Closing/reopening without
CLUTTER_CARET_TRACE disables panel; no cleanup of notes/builds or owner restart.

## What is observed

Public DOM selection write calls, editor focus/blur, pointer/mouse/key classes,
selectionchange, relevant editor class/mode attribute changes, computed caret colour,
anchor/head node kinds/offsets and focus/hidden-mode state. Selection-method wrapping
is feature-tested; report lists installed probes. State fields are deltas after first
row.400-row cap and12-second auto-stop restore exact original method descriptors.
Duration is capture lifetime, not an input/presentation latency measurement.

No note text, title, page/Space IDs, URLs, tokens, literal keyboard characters or
clipboard contents read. Input keys are classified except structural keys/shortcuts.
Report remains in memory until explicit Copy trace; no HTTP/RPC/DB/native event/report
write path. In-memory UI chrome is outside editable DOM and not saved. Capturing
may affect timing; a non-reproduction is useful to report, not a fix qualification.

## Architecture/completion review and evidence

Editor/UI/Core/runtime/native/schema/contracts/dependencies and immutable bundle files
unchanged. New optional host observer is behind existing bootstrap origin guard;
flag belongs to source runner/reopen mechanism, not feature policy. No semantic
writer, second selection state, binding private APIs, caret animation/CSS or artificial
blink timing added. No user content/credential files inspected. Native trace pending.

3 final trace tests PASS: opt-in/origin guard, metadata privacy/method restoration,
bounded cap/clean stop.2 existing host bridge/reopen tests PASS.3 relevant editor/
real CLI/MCP cases PASS (formatted peer save/readback plus72 selection/re-entry root
stability). Strict Core/runtime TS and57-source boundaries PASS. No full220 replay;
that preceding model evidence did not qualify native blink anyway.

NEXT inspect actual trace and correlate first post-delete click with DOM selection/
focus writes, sync cadence and hidden-mode changes. Do not claim73 fixes the caret.
Remove temporary capture hook after cause is resolved unless justified as a dev tool.

## Actual report received; superseding checkpoint74

74 analyzes the actual73 native trace:156 events,12,002ms,dropped0. The report
is usable; no recollection needed. Save/sync repeatedly left/re-entered block mode
and transparent/normal caret colour BEFORE the first post-delete click at5025ms.
One focus/selection restoration at5026ms; normal caret state by5027ms, no subsequent
JS focus/selection writes through12002ms. This does NOT establish a post-click JS
reset loop or measure native caret paint.72 remains native FAIL.

74 removes the live transparent caret from empty/no-caret body mode: editor becomes
noneditable but keeps keyboard focus/tabindex. Public key handlers still own commands;
selected nonempty body blocks keep normal copy behavior. Text click restores editable
TextSelection. Existing Y guard uses an internal AllSelection-derived presentation
shield, preserving body mode/editability through remote restores and preventing its
own selection dispatches re-entering protection. Saved BodyBlockSelection model,
Core/history/save and object67 semantics unchanged. Redundant already-focused focus
call and transparent caret CSS removed. No blink animation, timers, native OS branch,
private binding mutation, dependency change or second semantic owner.

Native74 RETEST PENDING. Build changed source with `npm run desktop -- --new` (no
install, normal trace flag off). Delete all BODY blocks with Cmd+A twice/Delete:
no caret expected. Click empty body once, watch initial blinks and type. Confirm on
Mac before marquee/handles/reorder. Optional73 diagnostic remains default-off until
resolution; remove temporary hook after actual native confirmation. Prior68 client
and70 formatting native passes stay complete, no bookkeeping replay.
