// Represents an embed occurrence extracted from a page.
//
// Resolution is performed separately from parsing.
import type { Occurrence } from './Occurrence';

export interface Embed extends Occurrence {
  readonly target: string;
  readonly heading?: string;
  readonly blockReference?: string;
  readonly alias?: string;
}
