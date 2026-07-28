/**
 * Represents a committed, immutable snapshot of a document.
 *
 * A DocumentRevision is the result of a successful DocumentSession.commit().
 * It serves as an immutable historical value representing the document state at a specific point in time.
 * Revisions must never be edited in place after creation.
 *
 * Future features such as persistence, autosave, undo/redo, and version history rely on this concept of immutable revisions.
 *
 * Responsibilities:
 * - Represent a committed document snapshot.
 * - Identify a specific revision of a document.
 * - Act as the source for PageFacts generation.
 * - Support persistence, recovery, undo/redo, and future version history.
 *
 * A revision is immutable.
 *
 * Once created, it is never modified.
 */
export class DocumentRevision {
  /**
   * Monotonically increasing revision number within a DocumentSession.
   *
   * Note: Revision numbers are only guaranteed to be monotonically increasing within a single DocumentSession.
   * They are not globally unique identifiers across different sessions or documents.
   */
  public readonly number: number;

  /**
   * Immutable Markdown snapshot for this revision.
   */
  public readonly markdown: string;

  /**
   * Time at which this revision was committed and entered the session history.
   *
   * This timestamp records when the revision was created within the session and should not be treated as the document's filesystem modification time.
   */
  public readonly committedAt: Date;

  /**
   * Indicates whether this is the initial revision of the document.
   */
  public get isInitial(): boolean {
    return this.number === 0;
  }

  /**
   * Performs a value comparison between two committed revisions.
   *
   * Intended for change detection within the editing pipeline to determine if two revisions represent the same document content and version.
   */
  public equals(other: DocumentRevision): boolean {
    return this.number === other.number && this.markdown === other.markdown;
  }

  constructor(number: number, markdown: string, committedAt = new Date()) {
    this.number = number;
    this.markdown = markdown;
    this.committedAt = committedAt;
  }
}
