# NEW Core native build28 — prepared, Mac run required

Revision0.52, 2026-11-16. **The targeted host is implemented and ready to compile on
Mac. Mac compilation/native observations are NOT RUN here.** F009 disposable scope.
[Contract](native-contract.json), [runner](native/README.md), [review](../evidence/i1-native-28-2026-11-16/review.json).

| Boundary | Prepared / automated evidence |
| --- | --- |
| Browser | Actual bundled EditorViews without Node/fs/SQL/Buffer dependencies; shared root envelope/projection/rebase; SHA verified before use |
| Service | Actual PageOperations/SpaceService/SqliteVault schema3; one marked session/Space, exclusive writer; app-closed CLI/MCP same Core |
| Media ingress | Private flushed exact command+bytes journal before acknowledgement; same Core replay after owner death; failures/conflicts retained |
| Close/reload | Freeze inputs/history/buttons, await admitted media intents, journal or refuse, editor prepareClose; failed paths re-enable view |
| Media | View-owned PNG/cover Blob URLs revoked on refresh/detach; PDFKit bridge receives Core-read fixture bytes, not direct file URL/iframe |
| Native | Cocoa/WK/PDFKit source, single contract-loaded cases, read-only startup, same-session bootstrap/reload/reopen, manual report without private tokens |
| Packaging | Official checksum-pinned runtime, nested signing before outer strict verify, Git-internal output/cache/report, no main staging risk |

77 automated runtime cases pass:63 prior +13 native helper/bundle cases +1 empty-note
case. Strict TypeScript and legacy media12/page10/entity14/Node84 pass. Tests bundle
and execute the actual browser under jsdom, exercise actual packed Node owner/CLI/
MCP and concurrent bootstrap, journal failure/owner death, close refusal/protection,
URL lifetime, SHA tampering and explicit session choice. Empty notes now align with
the declared note schema instead of failing save/close. No dependency/lock changes.

The Linux platform preflight is blocked as expected. There is no Mac Cocoa SDK in
this environment: no compiled Swift/app/PDFKit render/key/traffic-light/IME/geometry
or Mac flush pass is inferred. Source changes/automatic helper passes are not those
observations. SQL Mac fullsync/checkpoint flags are requested/checked configuration;
profile still reports nativeDurabilityQualified:false. Native APIs/runtime/discovery/
peer auth/alias fencing/general decoders/PDF security/inline placement/conflict UI/
retention/GC/migration/D11 and full product gates remain open before real data.

## Next user action

Apply/commit28 on architecture/clutter-foundation, run `npm run native:core28` at
repo root on Mac, and report Ready or exact compiler/setup output. Only then guide
NC28-01, followed individually by02/03/04. Do not replay the old broad manual suite.
The native UI loads procedural steps from native-contract.json; no duplicated test
instructions in Swift. Raw user attempts remain separate from automatic helpers.

Generated app/runtime/setup/report paths are under Git's internal clutter-native28
folder; cannot stage on any branch. OS-temp session/Space/journal are synthetic-only.
A normal repeat refuses an existing session; same-session recovery is
`npm run native:core28:reopen`, original bundle/store, integrity/signature checks,
no new Space substitution, refuses a second live window. Use explicit --new only
for a new synthetic run; earlier locators/old sessions stay archived/intact. The
terminal prints an exact app-closed CLI read and stop command. Native Show report
reveals the sanitized manual report. Never ask for private endpoint/bootstrap files.
No agent commit/push, main/app/user-vault changes or full I1/G-Q acceptance.

## Compiler follow-up29 — 2026-11-16

User applied/committed28 (e2613ec2), but Mac Swift compilation failed at
Main.swift:107: callAsyncJavaScript requires `in:in:`. Fix29 corrects the label
and adapts the completion closure. No Ready/NC28 manual pass is recorded.
Apply29, rerun `npm run native:core28`, and report Ready or compiler output first.
Do not use --new/reset for this failure; no valid28 session was created yet.
Prior77 runtime/TS/regression evidence remains historical, not a Mac compile pass.
Current instructions: START-HERE.md. No main/production/runtime owner changes.

## Native interaction follow-up30 — 2026-11-16

User confirms29 runs; screenshot Ready. NC28-01 remains incomplete: one remount
click left A closed, toolbar Undo/Redo jumped caret. Fix30 recreates A immediately
over the same context and retains local selection/history. Toolbar preserves mapped
current caret/range and focuses its target view; keyboard history defaults unchanged.
Three focused automated checks added; actual Mac retest pending. See fix30 review
for current test results. Older29 compiler-failure next-action text is superseded.

NEXT: apply30; safely close current lab; run `npm run native:core28 -- --new` for an
explicit NEW corrected synthetic run, preserving old bundle/store/report/locator.
Reopen runs its original bundle and cannot load patched source. No upgrade/reset
of an existing Space is attempted. Never use --new for recovery. Retest NC28-01
only; do not claim its Pass or advance02 until user confirms both issues fixed.
START-HERE.md is the current checkpoint. No main/app/real-vault changes.

### User confirmation after fix30 — 2026-11-16

User: "perfect worked" after corrected NC28-01 retest. Record user-reported PASS
for one-click A remount/history and toolbar mapped caret/selection; raw report not
reviewed. Next NC28-02 only in current session;03/04 not-run. This checkpoint is
local until included in next patch; do not ask user to apply a status-only patch.

### NC28-02 confirmation — 2026-11-16

User reports "pass" after image/cover/native PDF/replacement instructions. NC28-02
is user-reported PASS, raw report not reviewed. Next03 first stage: Fail media +
Fail journal, Add sample image, red close refuses. Do not mark03 Pass yet.04 not-run.
Current-session work only; no --new, no typing during03, no status-only patch.

### NC28-03 confirmation — 2026-11-16

User passed each guided stage: failed journal refused close; durable journal allowed
close; same-session reopen retained pending request; retry with media failure cleared
published in both views and count0. NC28-03 user-reported PASS; raw report not read.
Next04 failed-save + failed-protection close refusal FIRST; full04 still not-run.
Do not repeat01–03 or use --new. Checkpoint remains local until next scoped patch.

### NC28-04 progress — 2026-11-16

User confirms unsafe-close refusal, protected close, explicit Recover protected A,
then successful save and service restart retaining PROTECTED in both views. Initial
old-data screenshot preceded clicking Recover; user corrected that omission and
recovery passed. Final app-closed same-Space CLI read still pending;04 NOT complete.
No raw report audit, no new session or broad replay. Local checkpoint awaits delivery.

## Completion checkpoint31 — 2026-11-16

Supersedes earlier pending-test next actions. NC28-01…04 user-reported PASS; supplied
app-closed CLI JSON confirms PROTECTED at sequence38. Raw native reports not audited.
I1 disposable integration milestone complete; see i1/completion-review.md (relative
to foundation root). No production baseline/G-Q acceptance.31 is docs-only, no new
tests. Next bounded production host/runtime contract and pre-measurement D11 inputs;
no repeated native/manual suite or user-vault work. START-HERE is the resume point.
