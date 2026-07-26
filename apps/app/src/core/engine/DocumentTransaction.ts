/**
 * Represents a proposed change to a document.
 *
 * A DocumentTransaction describes what should change,
 * but it does not modify the document itself.
 *
 * A DocumentSession validates and commits a transaction.
 *
 * A successful commit produces a new immutable
 * DocumentRevision.
 *
 * Responsibilities:
 * - Describe a document change.
 * - Preserve the intent of the edit.
 * - Produce a committed DocumentRevision when accepted.
 *
 * A transaction is temporary.
 *
 * Once committed or rejected, it has no further lifecycle.
 */
export class DocumentTransaction {
  /**
   * The Markdown content proposed by this transaction.
   *
   * A transaction describes the next complete document state,
   * not an editor-specific operation.
   */
  public readonly markdown: string;

  /**
   * Indicates whether this transaction changes the document.
   */
  public get isEmpty(): boolean {
    return this.markdown.length === 0;
  }

  /**
   * Returns true if this transaction proposes the same document content.
   */
  public equals(other: DocumentTransaction): boolean {
    return this.markdown === other.markdown;
  }

  constructor(markdown: string) {
    this.markdown = markdown;
  }
}
