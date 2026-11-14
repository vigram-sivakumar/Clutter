# Bounded durable-owner experiment

Revision 0.37. P-SQL proof, not a selected Clutter backend or production service.
Read [qualification and limits](../../../r07-durable-authority.md) and the frozen
[case contract](contract.json). The existing editor candidates remain independent
fixtures; this slice does not connect their transaction/history engines to disk.

## Run the automated proof

From this experiment's package directory:

```sh
npm ci --ignore-scripts --workspaces=false
npx playwright install chromium
npm run test:durable
```

Use a Node runtime exposing `DatabaseSync.enableDefensive`, with bundled SQLite
at least 3.51.3. The executed profile is Node 24.22.1 / SQLite 3.53.4 on Linux x64;
other profiles are not qualified. Existing editor scripts keep their original
Node requirement. `CHROMIUM_EXECUTABLE=/absolute/browser` selects an existing
Chromium. Unsupported profiles fail instead of quietly using weaker settings.

The driver creates new marked synthetic directories in the OS temporary folder,
starts real owner/CLI/MCP child processes and opens two browser projections. It
kills child owners at observed boundaries, then opens the same store in a fresh
process. Output is `artifacts/durable-results.json`. It does not inspect or modify
production vaults. Temporary stores are retained for diagnosis; no automatic
compaction, backup or cleanup protocol is qualified.

`owner.mjs` requires an explicit `--store PATH`; `--init` refuses a nonempty
folder. Standalone stdout intentionally prints no bearer token. Test parents get
connection descriptors through Node IPC. The CLI/MCP use the existing transport
variables `CLUTTER_LAB_RELAY_URL` and `CLUTTER_LAB_RELAY_TOKEN`; for this slice they
point directly to the durable owner, not the older browser relay. No adapter
imports SQLite or opens the vault. The `model.mjs` schema/reducer and `store.mjs`
execute path are the only domain implementation in this fixture.

Parent IPC controls expose deterministic faults only to the test launcher. They
are not HTTP/MCP methods or request fields. This is not a production permission,
process-discovery, endpoint-publication or MCP conformance implementation.

## Representation and lifetime

- `revisions`: immutable full synthetic `{doc, attachments}` snapshots, hashes,
  parent and operation ID. `meta.current_version` selects the accepted root.
- `outcomes`: stable semantic request hash and committed original receipt.
  Transport tokens and owner epochs are not operation identity.
- `pins`: references retained revisions; all revisions remain retained anyway.
  There is no garbage collector, retention budget or unpin protocol here.
- `blobs`: small content-addressed bytes in the same SQL transaction. The attachment
  array is fixture document metadata, not an inline media node or renderer.
- `recovery`: separate provisional draft plus base/generation/owner epoch. Release
  leaves a generation tombstone. Recovery never silently replaces accepted state.

Task data exists only in the PM document. Read-only browser projections are fetched
from the owner and are not persisted separately. The input/unknown-request buffer
is explicitly provisional and memory-only; closing the browser is not protected
by this UI. The recovery commands are separately exercised by the driver. A retry
button keeps the same operation after a lost reply; a page reload is not a durable
client operation journal. No restart guarantee is made for selective undo stacks.
