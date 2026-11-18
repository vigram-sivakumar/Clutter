# Clutter Structured continuation

Read docs/foundation/START-HERE.md, docs/foundation/rebuild/stage3-ux.md,
docs/architecture.md and docs/development.md.
Confirmed product behavior is in docs/foundation/product-contracts.md and
docs/foundation/table-interaction-contract.md. docs/foundation/AGENTS.md owns working rules.
The user authorized complete removal of old architecture, not a compatibility project.
Do not resurrect the retired CM6/full-or-compact Markdown/vault/persistence pipeline.

Stage3 execution order and acceptance: docs/foundation/rebuild/stage3-implementation-plan.md.
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

MANDATORY ON EVERY CHANGE: follow the completion review in docs/foundation/AGENTS.md.
Remove superseded paths; check for duplicate owners/implementations and boundary
violations; verify UI/CLI/MCP share the accepted Core/persistence path. Record relevant
real CLI/MCP checks and distinguish automated evidence from actual Mac observations.
Do not declare completion without this review, even for a small correction.
