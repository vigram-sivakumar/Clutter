// TODO(v2): Migrate to TagOccurrence once the occurrence model
// (provenance, source ranges, and document version) is introduced.
//
// For now, this represents an extracted tag from a page.
export interface Tag {
  readonly name: string;
}
