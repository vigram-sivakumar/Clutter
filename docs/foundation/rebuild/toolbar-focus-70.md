# Toolbar focus ownership70

17 November2026. User69 Bold/selection retention PASS, but all three colours and link
controls dismiss toolbar on interaction. Correction only; format schema/executor,
Core/history/save and native/OS/dependencies remain unchanged.

## Failure and correction

The prior visibility check required editor focus OR an already-focused toolbar
control. During a focus handoff there can be an interval where neither reports focus;
hiding toolbar then unmounts the very control taking focus. Native select popups can
also temporarily leave activeElement on body/null. Original automated test immediately
focused controls and therefore did not expose that interval. User Mac events were
not instrumented; native confirmation of correction is still required.

One shared interaction flag is claimed during document pointer capture inside toolbar,
or a focus transfer targeting it. Meaningful outside pointer/focus, Escape and normal
view/range guards still dismiss. Temporary body/null focus does not mean dismissal.
No blur timeout, OS check, colour/link-specific repair, blanket preventDefault on
inputs or second toolbar. Existing PM range remains mapped through transactions;
React URL draft is retained because its control stays mounted. Apply/Remove use the
same formatting executor/context history and accepted Core/SQLite as69.

## Scoped Mac check

Apply70 over69 and `npm run desktop -- --new`; no install. Prior synthetic sessions
keep original bundles. Type Alpha beta gamma in the new note body and select Alpha.

1. Open **Text colour**. Toolbar/dropdown must stay usable; choose Red. Only Alpha
   changes colour and selected range stays. This is the first retest.
2. Repeat Text highlight and Block background. Highlight only Alpha; background whole
   paragraph. Controls remain usable through opening, choosing or cancelling a menu.
3. Link: open, click URL field and type a valid https URL. Toolbar and draft remain;
   Apply link updates original selection. Reopen Link, Remove link works on same range.
4. Clicking/focusing outside dismisses normally. Escape dismisses while retaining
   text selection. Undo/Redo/Save preserve accepted formats;69 semantic rules unchanged.

Do not mark all native controls passed from the first Red check alone. Continue scoped
checks one at a time before3C.68 dedicated real Mac client milestone stays complete;
real peer formatting regressions still run for this task's mandatory completion review.

## Verification and completion review

210 full Linux tests PASS; strict Core/runtime TS and54-source boundaries PASS.
The new production React/PM/Core/SQLite regression intentionally leaves body focused
between toolbar pointer/keyboard intent and control focus, with a delayed scroll
update. It covers all three selectors, link typing/draft retention/Apply/Remove,
original range and accepted saved formats, plus genuine outside pointer/focus dismissal.
Existing real CLI/MCP formatting/invalid-format/history regressions PASS. Original
focused formatting subset16 tests passed; final full run includes extended removal.
Native popup/pointer behavior remains pending user retest; no Windows/IME claim.

Mandatory review: one shared focus lifecycle replaces instantaneous-focus-only
visibility. No alternate command/save/history, copied range, OS/per-control branches
or production delay. Schema/mark/preset validators, UI component, Core/runtime/native
sources, dependencies/locks and69 ignore/roadmap changes are untouched. Only focus
adapter, related regression and progress/evidence docs changed.

## Actual user70 result

User reports “all the formats pass.” Formatting controls, including previously
reported colour/link interactions, are now native PASS. Final Undo/Redo and
Save/window-reopen formatting persistence check remains separately unconfirmed.
Record that next, then3C. Include this observation in the next source delivery;
no code or tests changed for recording feedback.

## Final formatting acceptance — COMPLETE

User PASS after requested Bold+text-colour, Undo twice/Redo twice, Save, red-button
close and same-session reopen retaining text/formats. Combined with all-controls
PASS above, formatting capability is complete. NEXT3C Ctrl+A/body block selection
per consolidated UX; do not repeat completed tests for bookkeeping. Observation
update queued for next delivery after70. No owner restart/shipping inference.
