/**
 * Represents an immutable committed version of a document.
 *
 * A DocumentRevision is produced whenever a DocumentSession
 * successfully commits a DocumentTransaction.
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
   */
  public readonly number: number;

  /**
   * Immutable Markdown snapshot for this revision.
   */
  public readonly markdown: string;

  /**
   * Time at which this revision was committed.
   */
  public readonly committedAt: Date;

  /**
   * Indicates whether this is the initial revision of the document.
   */
  public get isInitial(): boolean {
    return this.number === 0;
  }

  /**
   * Returns true if this revision contains the same document content.
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
