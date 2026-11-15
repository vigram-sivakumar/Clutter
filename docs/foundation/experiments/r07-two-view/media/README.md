# External PNG/PDF proof22

[Result/limits](../../../r08-media-closure.md) and [frozen protocol](CONTRACT.md).
From the experiment package, `npm run test:media` runs12 cases with real child
owners/files/SQLite and13 crash phases. `npm run test:media-ports` checks the old
snapshot and joined Y owner profiles headlessly. Existing compatible Node24 and
locked dependencies; no browser or native rebuild is required for these commands.

model.mjs extends the canonical entity model via declared Y maps; it owns import,
association removal and versioned asset reads. files.mjs is the Linux-tested file
publication port (file/directory fsync and same-filesystem no-overwrite hard links).
formats.mjs validates a bounded inert-byte fixture subset. owner.mjs and mcp.mjs
only wire those operations into existing transport/transactions/framing. There is
no separate media transaction engine or adapter-level filesystem bypass.

Commands target a Space aggregate plus page ID for import. Page IDs can identify
notes or tasks; role can be body or cover. Opening a task as a page resolves that
same task and its associations. Current PM body schemas remain minimal; do not
mistake manifest association coverage for full native media-block rendering.

Tests create private temporary stores, never user vaults, saved native sessions or
existing experiment stores. Results go to ignored artifacts/. Valid tiny.png and
tiny.pdf are intentionally versioned source fixtures. Objects/stages are temporary
test data and must never be committed. Orphans are deliberately retained, not GC'd.

The common Store now awaits model staging and calls optional external-state/read
ports. Models without those ports keep the original SQL behavior; entity14,
Node84 and old-profile headless checks pass. Browser reruns were environment-blocked
and remain labelled separately. No user manual replay is requested.

This is not production PDF safety, general format support, power-loss, Mac fullsync
or Windows publication proof. Follow START-HERE for the architecture readiness review.
