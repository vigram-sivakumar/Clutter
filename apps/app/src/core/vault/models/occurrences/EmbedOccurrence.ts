import type { Occurrence } from './Occurrence';

// An embedded page or block extracted from a page.
//
// EmbedOccurrence is the runtime representation of an embedded reference
// discovered during page analysis. It is intentionally independent of the
// Markdown parser implementation.
export interface EmbedOccurrence extends Occurrence {
  readonly target: string;
  readonly heading?: string;
  readonly blockReference?: string;
  readonly alias?: string;
}
