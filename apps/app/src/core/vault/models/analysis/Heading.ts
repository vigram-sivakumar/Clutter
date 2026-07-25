// A heading extracted from a page.
//
// This is a runtime domain model and is intentionally independent of the
// Markdown parser implementation.
export interface Heading {
  readonly level: number;
  readonly text: string;
}
