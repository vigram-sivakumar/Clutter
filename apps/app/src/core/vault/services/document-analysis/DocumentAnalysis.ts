import type { ScannedTask } from './extractors/TaskExtractor';
import type { ScannedTagOccurrence } from './extractors/TagExtractor';

export interface DocumentAnalysis {
  readonly tasks: readonly ScannedTask[];
  readonly tags: readonly ScannedTagOccurrence[];
}
