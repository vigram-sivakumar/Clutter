import type { Occurrence } from './Occurrence';

// A task extracted from a page.
//
// TaskOccurrence is the runtime representation of a Markdown task. It is
// independent of the parser implementation and carries only domain data.
export interface TaskOccurrence extends Occurrence {
  readonly text: string;
  readonly completed: boolean;
}
