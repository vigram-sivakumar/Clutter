# Stable inactive body caret74

17 November2026. Applies over73. Preserves agreed no-caret bulk deletion UX.

## Trace finding and correction

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

## Completion review

One shared PM selection adapter and public Y guard; no React editable-DOM mirror,
new focus wrapper, separate clipboard implementation, schema or persistence change.
The transient shield is internal, synchronous and never saved; accepted content is
still authoritative through one Core/SpaceService. Empty body keyboard routing uses
existing public handleKeyDown handlers because PM skips edit handlers when noneditable.
Superseded transparent-caret rule and guard roundtrips are removed. First-click native
paint remains uncertain; source tests cannot establish blink cadence.

New regressions exercise actual mounted EditorViews, save/reconcile and real MCP
write/CLI read, including every intermediate guarded transaction remaining inactive.
Keyboard selection, copy excluding title, Delete/Escape and context Undo/Redo pass.
Existing pointer regression verifies visible editable text state before mouse-up,
unchanged CLI/MCP accepted head on click, then immediate typing. Wider results recorded
in evidence/inactive-caret-74.json relative to foundation root.

Validation74: full225 tests PASS (0 failures), including2 new regressions and real
CLI/MCP processes.12 prior focused selection/object cases PASS. Strict Core/runtime
TypeScript and57-source boundary audit PASS. Native build/blink NOT inferred.
