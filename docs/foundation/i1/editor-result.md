# Editor/context integration — implementation26

Revision0.50, 2026-11-16. **The editor slice is implemented and DOM-qualified; I1
remains partial.** No production app/main/user-vault writes or native acceptance.
[Contract before code](editor-contract.md), [review/evidence](../evidence/i1b-editor-26-2026-11-16/review.json).

| Result                    | Evidence                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same Core/API             | Seven inferred catalogue commands; context operations in existing PageOperations/SpaceService; no editor file/SQL save fallback                           |
| Actual two-view editing   | Real PM EditorViews/Y replicas; local/foreign edits, context-specific undo/redo, per-view selection, remount and missed-hint resume                       |
| Safe draft lifecycle      | Pending exact request after unknown reply, newer typing retained, failed-save/protection close guards, explicit epoch/recovery history boundary           |
| Protected recovery        | Separate immutable draft root + pending exact command + generation; canonical page heads unchanged; explicit peer-bound restore and save after restart    |
| Raw update admission      | Known accepted base, complete dependencies, strict binary consumption and supported XML; title/properties/links/unknown content refused before projection |
| Peer and crash boundaries | Trusted peer/page/context grants; private outcomes;4 real child-process deaths around apply/protect commits; exact post-commit replay                     |
| Interface parity          | Separate CLI/MCP processes update a mounted view and read UI edits through one running Core                                                               |

44 runtime tests pass:23 new editor cases plus21 I1a cases. Strict TypeScript and
84 old Node regressions pass. Full browser/native suites were not retried; prior
missing executable/socket environment blocks and old manual passes stay recorded.
No benchmark, power-loss, actual Mac close interception or native input claim.

The actual renderer/engine composition remains deliberately temporary and uses the
qualified nested PM/Y codec/history implementation. Product runtime source imports
no proof modules. The renderer augments the same node specs with DOM serialization,
not a second persistence schema. Enter assigns IDs in the original transaction so
history sees one coherent edit. Unknown XML and trailing binary bytes are rejected
before a lossy conversion can hide them. A final structural conflict audit also caught foreign paragraph replacement hiding
local pending text. Shared rebase admission now refuses before touching the live
replica/root; conservative recovery conflicts leave the immutable snapshot intact.
Foreign edits in a newly split paragraph survive undo. Earlier failing attempts
are retained.

jsdom supplies DOM/model/lifecycle automation, not layout. Tests explicitly handle
scroll requests without measuring geometry and fail on any uncaught DOM event
error. Native key chords/selection painting/IME/accessibility/focus/traffic-light
close integration still require targeted supported-host testing.

SQLite experimental schema2 adds actor-bound outcomes and immutable protected
roots; old schema1 temp stores refuse without automatic migration or overwrite.
Protection never replaces canonical heads. Snapshots remain retained; no active-
recovery cleanup, release/GC, production grant expiry/revocation, final format or
complete per-view layout/cursor persistence is claimed. The native host must call
prepareClose/sync and reconnect its hint subscription. No installed host is wired.

The package now declares the already-locked jsdom29.1.1 as a direct test dependency;
no new external package versions. Normal root install plus the existing nested PM/Y
install is required for developer tests. No generated runtime/cache/database output
is delivered. User applies26 over confirmed25 on architecture/clutter-foundation.

## Exact next work

Integrate image/PDF/cover operations through the SAME catalogue/PageOperations and
immutable Vault/platform ports. Reuse media admission/publication/closure rules and
atomic version sets; old media proofs do not qualify the new runtime by themselves.
Then run the targeted changed editor/media route on a supported browser/native host.
Do not redo I1a, broad engine research or the user's old manual keyboard session.
G-Q remains before real-vault writes/release. Task pages retain full intended body,
cover and embed capabilities; the paragraph-only renderer is a bounded dev adapter.
See [START-HERE](../START-HERE.md) for the current resume checkpoint.
