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
  readonly dueDate?: string;
  readonly completedAt?: string;

  // TODO: @priority, @repeat, @estimate, @reminder — add a field here (and
  // a case in TaskExtractor's recognized-key map) when each is supported.
}
