import type { Occurrence } from './Occurrence';

// A tag extracted from a page.
//
// TagOccurrence is the runtime representation of a tag discovered during
// page analysis. It is independent of the Markdown parser implementation.
export interface TagOccurrence extends Occurrence {
  readonly name: string;
}
