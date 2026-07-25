// Represents a wiki link occurrence extracted from a page.
//
// Resolution is performed separately by LinkResolver.
import type { Occurrence } from './Occurrence';

export interface Link extends Occurrence {
  readonly target: string;
  readonly heading?: string;
  readonly blockReference?: string;
  readonly alias?: string;
}
