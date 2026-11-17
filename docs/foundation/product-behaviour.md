# Confirmed product behaviour

Status: confirmed directions from the 2026-11-14 question sequence. Later answers
replace earlier alternatives. Technical mechanisms below are constraints to design,
not claims of implementation. Requirement IDs are defined in [product contracts](product-contracts.md).

## Properties and collection views — P-25

Notes, daily notes and task pages can own arbitrary typed custom properties.
Definitions/values belong to the individual entity; there is no global property
registry that silently updates all notes. Types include the agreed text, number,
date, checkbox and selectable-option concepts; the complete type list is not frozen.

Collections have a predefined field set appropriate to their purpose. They do not
inspect arbitrary note properties to generate columns, reconcile same-label types,
or add properties to notes. The earlier dynamic database/Books-table proposal and
its mismatch handling are withdrawn. No relationship/rollup/formula feature follows
from this conversation.

The Tasks view may expose standard task fields such as scheduled date, deadline
and reminder. Tasks also support custom properties like notes. Standard fields
may appear empty for convenience; default visibility is still a UI decision.
Displaying an empty field does not itself require creating arbitrary custom data.
Custom properties stay on the entity until the user explicitly adds/changes them.

## Tasks, pages and location — P-26, P-27

A task has a stable identity, standard fields, custom properties and its own
editable body capability. Its full page is the same task entity, not another note.

Stage3 UX clarification (2026-11-17): a task inserted in a note starts in inline
editing mode. Clicking its title edits it in place. Only clicking the adjacent
conversion icon converts it to a full task page; afterwards, clicking the title
opens that page, while its checkbox still toggles completion independently.
Conversion preserves identity/status/properties and ownership; do not create a
second task. Unconverted-task routing in the global Tasks view will be agreed in
that view’s UX stage. See [Stage3 UX](rebuild/stage3-ux.md) for inline keyboard rules.
Body text is not a separate note copy. A task has exactly one owning location:
one note, or the independent All Tasks inbox. The global Tasks list is a projection,
not an additional owning location. Tasks are not referenceable from multiple notes.

Creating a task from All Tasks creates an inbox task. It does not create a daily-note
block automatically. An inbox task can later be moved into a note.

| Action                              | Required result                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Cut/paste to another note or inbox  | Move the existing task; preserve ID, body, fields and history; remove the old placement                   |
| Copy/paste                          | Independent task with a new ID and copied body/properties; changes/completion no longer affect the source |
| Delete the task block from its note | Delete the task entity, with recovery; it does not remain active as an invisible orphan                   |
| Delete its owning note              | Delete its owned tasks; restoring the note restores them subject to identity-safe reconciliation          |
| Archive its owning note             | Hide owned tasks from active task views and suppress its reminders                                        |
| Restore the owning note             | Return tasks to applicable views; resume future reminders only                                            |
| Visually indent a task              | Change layout/list indentation only; never create a subtask relationship                                  |

There are no subtasks or parent-task completion/date dependencies. A task's page
body can contain ordinary content. Whether it can contain further independent task
entities needs an explicit schema rule; indentation is not permission to introduce
a subtask model. All remaining task nesting/cut-and-copy details must preserve this
single-location contract.

Proposed schema invariant: separate task identity/content from its sole placement
so views never duplicate it. Choose the canonical storage representation in D-02;
this is not authorization to keep two independently editable copies of the body.
Moves and restore must not leave duplicate ownership, including after sync.

## Repeating tasks — P-28

Completion retains the old occurrence and its body, then creates the next occurrence
only after completion. The next occurrence copies title and properties, starts
with an empty body, resets completion state, and advances temporal fields under
the repeat rule. The empty-body answer replaces the earlier copy-body answer.

Follow the original schedule rather than completion time. Skip missed slots and
select the next future scheduled occurrence. Example: a Monday task completed the
following Wednesday next occurs on the upcoming Monday, not Wednesday and not the
already-missed Monday. Link occurrences to the series without making them one
shared mutable task. Repeat completion must not generate duplicate occurrences
on retry or after provider sync. D-13 must specify generation identity, original
schedule/time zone, rule edits and the mapping of deadlines/reminders; do not copy
expired timestamps blindly.

## Templates — P-29

Applying a template copies content and properties to a note/daily note. There is
no continuing template reference, update tracking or propagation. Later edits to
the template do not alter existing notes. Task/page/block identity-bearing content
must get appropriate new IDs when copied, not alias the template's entities.

## Convert to page and embed — P-30

Convert selected text or a whole block into a new page; move the selected content
into it and leave a clickable reference at the original location. This does not
create shared editable content in two places. General page references are allowed;
the no-multiple-note-reference rule is specific to tasks.

Live page embeds are read-only projections. Clicking opens the original page for
editing. Updates to the original refresh the embed. The embedding note cannot
become a second body owner or nested editor/history authority. Circular embeds,
missing targets, export fidelity and selection boundaries need explicit handling.
Images and PDFs are initial media embed types; page embeds are not excluded by
that media scope decision.

## Dates, reminders and archive — P-31, P-32

Date mentions such as @today/@tomorrow resolve to fixed calendar dates when
inserted. The display label is relative: today's fixed date displays Yesterday
the next day. Do not advance the stored date merely because its label changes.

Any block may have a reminder. A date mention alone does not notify; the calendar
date picker has an explicit reminder toggle. Tasks distinguish scheduled date
(when planned), deadline (when due) and optional reminders.

Archive suppresses reminders for the note and its owned content. Restoration does
not emit missed reminders; future reminders resume. Specify date-only versus timed
values, user time zone/DST, repeated reminders and multi-device notification
ownership before scheduler implementation. Restoration must not backfill repeating
task instances for missed archive periods under a hidden policy.

## Comments and sharing — P-20, P-33

The agreed comment contract is anchored page/block/text threads with replies and
resolution. When an entire block is deleted, its thread leaves current content
but remains attached to the historical/deleted content. Undo or a version restore
that restores that content restores its discussion. Do not move the thread to
unrelated content or present it as an active orphan thread.

Product support is recorded; the initial release timing for comments is not yet
settled. Model/history design must preserve their anchors and restoration path.

Individual-page viewer/commenter/editor sharing is a future cloud-service scope.
Public publishing is deferred. No current sharing UI, membership server or remote
permission enforcement is implied by local/provider file access.

## Scope corrections

The dynamic property-based collection proposal, subtask hierarchy, automatic
creation in today's daily note, shared editable embeds and initial mandatory live
collaboration were all superseded during clarification. They must not reappear as
requirements through older draft text. See the changelog and acceptance matrix.
