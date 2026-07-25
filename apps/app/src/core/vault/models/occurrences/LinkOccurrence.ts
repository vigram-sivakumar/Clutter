import type { Occurrence } from './Occurrence';

// A wiki or Markdown link extracted from a page.
//
// LinkOccurrence is the runtime representation of a reference discovered
// during page analysis. It is intentionally independent of the parser
// implementation.
export interface LinkOccurrence extends Occurrence {
  readonly target: string;
  readonly heading?: string;
  readonly blockReference?: string;
  readonly alias?: string;
}
