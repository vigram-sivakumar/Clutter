// Base information shared by every extracted occurrence.
//
// An occurrence represents a fact extracted from the analysis of a single
// page. It records the page where the occurrence was found.
export interface Occurrence {
  readonly sourcePageId: string;
}
