# I2a result46

Implemented EditingContextRegistry in packages/foundation-runtime, exported through
its index. The composition factory supplies existing EditorSession. No session,
SpaceService, mutation handler, save/protection reducer or storage engine is copied.

Seven unit cases cover concurrent acquisition, identity, invalid IDs, failed open,
lease idempotence, active-borrow refusal, unsafe retirement and close/error races.
Two actual SQLite/Core/PM-Y cases prove remount undo/redo and retained unsaved text
when save and protection both fail, followed by retry through the same session.

Validation on Linux/Node24.22.1: targeted36/36, full runtime89/89, strict TS passes.
No dependency/lock updates. Not wired into a new desktop UI; no Mac manual acceptance
is claimed or required for this adapter-only slice. Final-view release deliberately
retains the session until explicit safe retirement; no automatic/LRU policy yet.
Window close must use existing protection policy while views remain live before
releasing leases; registry.close alone does not implement that UI guard.

[Contract](contract.md) defines scope. I2b extracts qualified editor/schema/codec
implementations once; I2c wires the selected host. [START-HERE](../START-HERE.md) is
canonical for continuation. Evidence and fresh test logs are under evidence/i2-entry-46.
