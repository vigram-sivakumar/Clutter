// An alternate name declared by a page.
//
// Aliases are part of the runtime domain model and are intentionally
// independent of the Markdown parser implementation.
export interface Alias {
  readonly value: string;
}
