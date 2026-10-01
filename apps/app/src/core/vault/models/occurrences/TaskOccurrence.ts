import type { Occurrence } from './Occurrence';

// A task extracted from a page.
//
// TaskOccurrence is the runtime representation of a Markdown task. It is
// independent of the parser implementation and carries only domain data.
//
// Positional identity: `startOffset`/`endOffset` (inherited from
// Occurrence, always populated by TaskExtractor for this occurrence kind)
// are the task's exact character range in `sourcePageId`'s current
// `source.markdown` — the authoritative way to locate *this specific*
// task occurrence, including distinguishing two textually-identical task
// lines in the same note. TaskOperations' mutation facade resolves the
// occurrence by these offsets too (locateLine()). `rawText` remains the
// original line's text — the check that the offsets still point at this
// task, and the input each mutation rewrites; on its own it is never used
// to decide *which* of several identical lines an action targets. Deliberately not
// a persistent id — see TaskOccurrence's own "future evolution" note on
// Occurrence.sourceVersion for why a stable TaskId is a separate, later
// concern this shape is already positioned to add without replacing
// startOffset/endOffset.
export interface TaskOccurrence extends Occurrence {
  readonly text: string;
  readonly completed: boolean;

  // Inline @key:value occurrence metadata (see TaskExtractor). Only
  // currently-recognized keys get a field; an unrecognized key is left
  // untouched inside `text` instead.
  //
  // For a task with no explicit inline date, TaskBuilder (the `tasks()`
  // live projection's builder) falls back to its containing page's own
  // date when that page is a Daily Note — so this field is populated for
  // every task created inside a Daily Note, explicit or not, with no
  // inline date ever written to the Markdown to produce that. An explicit
  // inline date always wins when both exist.
  readonly dueDate?: string;
  readonly completedAt?: string;

  // TODO: @priority, @repeat, @estimate, @reminder — add a field here (and
  // a case in TaskExtractor's recognized-key map) when each is supported.
}
