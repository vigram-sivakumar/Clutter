# Frozen joined fixture boundary

Revision0.39, 2026-11-14; implementation profile for the unchanged JG contract.
This specializes the0.38 proposal for an isolated experiment, not production.

- A new marked directory identifies `CLUTTER-R08-JOINED-Y-EXPERIMENT-1`; it cannot
  open/migrate a build13 snapshot store. SQLite user_version1 uses the shared Store
  transaction/recovery/outcome implementation with a supplied codec/domain port.
- Revisions and recovery payloads use SQLite BLOBs. A root contains the literal
  `clutter-r08-y-state-v1\0schema1\0yjs13.6.33\0` prefix and one full encoded Y state.
  Space/document/version/parent, payload SHA256 and original operation ID remain
  SQL root metadata. The prefix freezes semantic/engine decoder versions. PM JSON
  is derived for validation/reads and never stored as a second writable body.
- No GC, migration, external media or second body encoding. All fixture roots and
  receipts are retained. The fixture still lacks production block IDs/entity layout.
- `editor_update` has method, spaceId, documentId, operationId, contextId,
  baseVersion and full peer-state base64 payload. At most700,000 base64 characters;
  the shared HTTP frame limit is1MiB. Validate an isolated candidate and final
  semantic projection before transaction admission. Task fixture identities and
  embedded-original targets cannot be changed through this route.
- A full peer state carries causal dependencies. `baseVersion` must exist; it is
  an input provenance base, not a request to overwrite current. Apply the proposed
  Y state to the current committed root; simultaneous editor input merges locally.
  Public semantic insert still uses strict expectedVersion. This is local editing,
  not optional provider/latest-document reconciliation or cloud collaboration.
- A/B editor grants bind contextId outside the semantic payload. The main API token
  cannot call editor_update/protect/release for a context. Public CLI/MCP remain
  semantic adapters; context origins are not authorization. Discovery/grant issuance
  is supplied by the test parent, not qualified production IPC.
- Serialize commands in the real owner. Encode/stage without mutating any accepted
  live replica; commit the new BLOB/root/receipt atomically; only then emit hints.
  Readers decode committed roots. A no-change merged root records a receipt at the
  existing version. Unknown COMMIT stops further mutation until outcome lookup
  checks closure or process restart validates it. Unresolved client retries keep
  the same command/operation ID and exact semantic payload.
- Browser RemoteAuthority is a revision-tagged read cache plus provisional editing
  contexts, not an independent writer. It reuses the existing PM/Y view/history/
  table mechanisms. Pending edits queue outside EditorView lifetime. Context-owned
  UndoManager stacks survive destructive view detach; owner restart clears them
  at an explicit interactive-history boundary. Retained document versions survive.
- A pending structural table-history tag waits for commit, then maps to the exact
  committed fixture table. This fixture supports one table for this scope binding;
  broader table identity/mapping requires the production stable-block model.
- Protect writes the full provisional Y closure/base/generation. Failed protection
  blocks destructive view close; successful protection precedes actual destruction.
  Restoring an abandoned draft requires matching current base and creates a new
  root. Generation tombstones and stale cleanup use the common durable protocol.
- Test-parent IPC alone controls save/protection faults, phase pauses, dropped hints/
  replies and injected lost COMMIT return. A synthetic main-mutation failure can
  leave the recovery transaction available; this does not simulate a physically
  unwritable disk becoming writable for protection. Real disk/power/VFS/native
  failures remain unqualified. SIGKILL is observed at application boundaries.
- Restart tests rebind the same loopback origin with fresh credentials. The browser
  CSP remains same-origin; cross-origin endpoint relocation, installed discovery,
  signing and shell lifetime are G-N, not claimed by these tests.

Owner source: `joined/owner.mjs`; shared `durable/host.mjs` and `durable/store.mjs`.
The default snapshot profile remains independently regression tested. No forked
SQLite transaction engine or CLI/MCP business implementation is introduced.
