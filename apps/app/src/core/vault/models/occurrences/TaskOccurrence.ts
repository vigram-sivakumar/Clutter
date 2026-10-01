import type { Occurrence } from './Occurrence';

// A task extracted from a page.
//
// TaskOccurrence is the runtime representation of a Markdown task. It is
// independent of the parser implementation and carries only domain data.
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
