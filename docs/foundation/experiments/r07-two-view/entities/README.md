# Canonical entity proof21

Read [qualification result](../../../r08-entity-closure.md) and
[contract frozen before implementation](CONTRACT.md). Run `npm run test:entities`
from the parent experiment package. Reuse installed locked dependencies and a
Node24 SQLite profile with defensive mode support. No browser or native rebuild.

`model.mjs` is the semantic command/codec port into the existing real SQLite
Store/host. `schema.mjs` is a small PM schema for stable paragraphs and owned task
slots, with independent task bodies. Only Y root bytes persist; decoded JSON and
placement maps are disposable projections. The separate marker/schema version
refuses accidental writable open with the old one-document model.

The owner is `node entities/owner.mjs --store EMPTY_TEST_PATH --init` for a new
synthetic store; ordinary open omits --init. Never point it at a user vault, native
saved session or existing experiment store. The test runner creates its own paths.

Existing durable/cli.mjs sends the same semantic commands; entities/mcp.mjs adds
only schema wiring to the existing MCP stdio framer. No independent reducers,
filesystem shortcuts, live-editor mutation endpoint or production grant discovery.

The current `documentId` envelope field identifies this profile's aggregate Space
root. Notes/tasks are independently identified inside it. Coarse snapshot commits
are a closure proof; final partitioning, body binding and performance are unaccepted.
Task-content restore is separate from conservative note-content restore. Read the
contract's limits before extending it. JG13 external attachments is next.
