// Base information shared by every extracted occurrence.
//
// An occurrence represents a fact extracted from the analysis of a single
// page. Runtime occurrence models inherit this provenance so they can be
// replaced, diagnosed, and incrementally updated without depending on the
// Markdown parser.
export interface Occurrence {
  // Canonical runtime page that produced this occurrence.
  readonly sourcePageId: string;

  // Exact source text that produced the occurrence.
  //
  // TODO(v2): Populate this during analysis.
  readonly rawText?: string;

  // Source range within the page.
  //
  // TODO(v2): Introduce a dedicated SourceRange model instead of primitive
  // offsets when incremental editing is implemented.
  readonly startOffset?: number;
  readonly endOffset?: number;

  // Version of the page analysis that produced this occurrence.
  //
  // TODO(v2): Replace with a stronger document version or content hash.
  readonly sourceVersion?: string;
}
