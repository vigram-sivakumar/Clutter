# Caret re-entry72

17 November2026.71 requested select-all/body/title check works. User reports slow/
faded/odd initial caret blinking after bulk delete then clicking editor. This is not
an intended delay. No-caret bulk-delete mode is preserved; the assistant's alternate
proposal to show caret automatically was not implemented.

## Source correction

71 resumed text only in handleClick after mouse-up, and required a depth1 hit. Root
boundaries (for example below an empty paragraph) were rejected until later browser
selection normalization. Public hit testing on mouse-down now resolves normal text
positions/boundaries, focuses first then publishes one visible pointer selection.
Default PM/browser dragging and multi-click handling continue. Same helper provides
handleClick fallback; no competing click/cursor implementation. Direct object/nested
modes are not intercepted; clicking body whitespace cannot select the title. No new
paragraph is silently created on background click.

The existing Y before/after selection guard previously ran for selection-only view
updates too, because the binding opens Y transactions while syncing selection. Scope
its protection to potentially document-changing replica operations: local doc-changing
transactions, accepted remote applies, context Undo/Redo. Pure mode/focus updates
never need a temporary AllSelection shield. Actual document changes retain stable-ID
node/body selection protection; no extra manager, private binding patch or Y fork.

This addresses source transition timing. Native event trace/paint was not captured
in Linux; do not claim actual WebKit blink/colour fixed until the Mac retest. No
production delay, forced cursor colour, synthetic blinking CSS or OS-specific path.

## First Mac retest

Apply72 over71 and `npm run desktop -- --new`; no dependency install. Give note title
and body text, select all BODY blocks with Cmd+A twice, Delete. No caret yet is expected.

Click once in the empty body paragraph/its whitespace. A clear normal caret should
appear immediately; type immediately. Repeat once to check no delayed/faded initial
blinks. Native appearance/typing result is the requested retest. If it still occurs,
report that rather than marking pixel behaviour passed from model tests.

Object67 Enter/delete, title exclusion and flat explicit deletion remain unchanged.
Marquee/handles/reorder are still next on this same selection model, not delivered72.

## Verification and mandatory completion review

220 full Linux tests PASS;12 focused selection/object tests PASS. Strict Core/runtime
TS and57-source boundaries PASS. New tests capture selection-only dispatches with no
AllSelection roundtrip; after bulk deletion a public boundary hit on mouse-down yields
exactly one visible TextSelection before mouse-up, removes hidden-mode classes,
repeats without oscillation and types immediately. Real CLI/MCP reads confirm clicks
leave accepted document head unchanged. Existing actual-change Undo/Redo, remote
selection protection, object and production UI regressions remain passing.

Hit coordinates are controlled through the public test API; jsdom does not paint
native blinking/colour. Native retest still required. One shared resume helper replaces
late-only click logic; createViewSelectionGuard replaces old unscoped guard function,
no leftover alias or second history/selection owner. No CSS/schema/Core/runtime/native/
UI component/dependency/lock change; formatting and delete policy unchanged.

## Native retest72 — issue remains OPEN

User still observes2–3 rapid blinks before normal cadence. Clarification: ONLY first
click after deletion of ALL body blocks. Do not mark72 a native renderer fix. Next
[73 native capture](caret-capture-73.md) observes that exact one-click transition;
no additional speculative caret behavior change or full research/profiling gate.
