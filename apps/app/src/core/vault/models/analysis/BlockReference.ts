// A named block reference extracted from a page.
//
// This is a runtime domain model and is intentionally independent of the
// Markdown parser implementation.
export interface BlockReference {
  readonly id: string;
}
