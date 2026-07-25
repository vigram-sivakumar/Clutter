// TODO(v2): Migrate to TaskOccurrence once the occurrence model
// (provenance, source ranges, and document version) is introduced.
//
// For now, this represents an extracted task from a page.
export interface Task {
  readonly text: string;
  readonly completed: boolean;
}
