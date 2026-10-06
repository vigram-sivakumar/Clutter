# ADR-044: A task's due date is explicit — never implied by the Daily Note it lives in

**Status:** Accepted (product decision, Vigram, 2026-10-06)

## Context

`TaskBuilder` (the `Vault.tasks()` projection) stamped every undated task inside a Daily Note with that note's date as its `dueDate`, and the New Task flow created each task in its *due date's* Daily Note, defaulting the due date to today. The two concepts were fused: a task's location (the day it was written down) and its due date (when it is due). The consequence: a task with no due date, sitting in today's note, classified as **Today**; and giving a task a due date implied putting it in that date's note.

## Decision

The note a task lives in is **context**; the due date is **explicit metadata**. They are independent.

1. `TaskOccurrence.dueDate` is exactly what `TaskExtractor` read from the task's own line (`@YYYY-MM-DD`, or legacy `@due:`). `TaskBuilder` no longer derives anything from the page. No due date means the field is absent — there is no persisted "none" value; clearing a date removes the token.
2. New tasks are always created in **today's** Daily Note (`createTaskInDailyNote`, resolved without opening it — `PageOperations.ensureAtPath`, see below). An explicit due date is written onto the line via `TaskOperations.create(pageId, title, dueDate?)`; without one the task is undated. A due date never opens, creates, or moves a task to another day's note.
3. Changing or clearing a due date edits only the date token in place (`setDate`/`clearDate`/`update`, already so); no operation moves a task between Daily Notes.
4. The New Task dialog's date field defaults to empty, not today.
5. Classification (`groupTasks`) is unchanged and now correct by construction: Today = explicit date is today; Overdue = before today; Upcoming = after; no date = Unscheduled.

`PageOperations.ensureAtPath(path, { type })` is the non-activating sibling of `openAtPath`: resolve the page, reuse the live draft for that path, or persist it empty through `persistDraft` (the same path `create()` uses) — without changing the active view. It exists so a caller can write into a page the user isn't looking at; a task added from the All Tasks page must not navigate (and `openAtPath` opened an empty editor before the write landed, leaving the note looking empty).

## Consequences

- **Behavior change for existing vaults:** tasks in Daily Notes that carry no inline date were previously shown dated by their note; they are now Unscheduled. No file is rewritten. A task the user wants dated gets an explicit date.
- Amends ADR-042's consequence "Tasks inside a trashed Daily Note keep their date-implied due date": there is no date-implied due date any more; an archived Daily Note's tasks keep only their explicit dates.
- `Vault.tasks()` stays a live projection with the same signature; only `TaskBuilder`'s derivation shrank. `PageOperations` gains one method (`ensureAtPath`); the frozen specification's §PageOperations lists `openAtPath` only and should add it.

## Alternatives Considered

- **Keep the fallback and add a `hasExplicitDueDate` flag** — rejected: every consumer would have to remember to check it (the original bug was exactly a consumer treating the derived value as real).
- **Write an inline `@today` date at creation** — rejected: it would invent a due date the user never chose.
