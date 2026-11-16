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
