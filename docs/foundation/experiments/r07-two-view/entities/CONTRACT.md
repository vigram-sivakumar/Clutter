# JG-12 canonical entity closure — frozen proof contract, 2026-11-15

Proposed representation, not an accepted product format. Extends the existing real
SQLite Store/host port; no production changes or duplicate persistence engine.
Old one-document native fixture cannot establish these guarantees.

One versioned Y root contains a `notes` map and a `tasks` map. Each task owns its
title, typed property map and PM/Y body exactly once. Notes contain `task_slot`
placement blocks, with no copied task title/properties/body. A task may occupy at
most one note slot. Zero slots means independent task page/inbox. The placement
index is derived, never a second writable owner field. Stable slot identity is
derived from task ID; note/task paragraph IDs are stable and globally unique.
Task bodies contain paragraphs only in this bounded schema: no nested tasks.

A move stages both note bodies in an isolated decoded Y root, validates all
entities and placements, then commits one root and original operation receipt in
the common SQLite transaction. No source removal before a committed move. All
interfaces send the same commands. Stale roots fail; exact retry returns its
original receipt even after restart; changed operation-ID reuse fails. Cross-Space
moves are not supported. Read projections and placement indexes are disposable.

Historical reads resolve notes, slots and task bodies against the SAME immutable
old root. Note-content restore restores note blocks only, not independently owned
task content. Task slots must have identical task/slot ownership in current and
historical note; moved, detached, newly inserted or missing tasks cause refusal.
The owner rechecks placement against current committed state, regardless of an
earlier client's preview. No silent task reclaim/duplication, implicit task-body
rewind or best-effort partial restore. Separate task-page version restore and
conflict resolution UX remain later contracts. These are conservative qualification
choices for review, not new user-approved UX.

Required cases: canonical page/projection; atomic move with title/body/properties
unchanged; standalone move; duplicate/dangling/nested identity rejection; historic
read/pin; conflicting restore after move/detach/insertion refused without mutation;
safe restore leaves newer canonical task content intact; stale plan rejected;
real process death before commit and after commit/before reply; crash retry receipt
and changed-ID rejection; desktop-facing RPC/CLI/MCP parity; on-disk one Y BLOB with
valid root/outcome closure and no writable JSON copy. Retain all history; no GC.

Limits: two notes/one task in fixture, paragraph/task-slot subset, explicit command
body replacement rather than native editor binding, one coarse Space-root revision,
no production performance, clipboard UI, cross-document undo, recurrence, deletion,
schema migration, multi-device merge or external media acceptance. JG-13 remains
separate. Full native tests already passed by user report must not be replayed.
