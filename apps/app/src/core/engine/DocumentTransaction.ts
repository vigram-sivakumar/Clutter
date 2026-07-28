/**
 * Represents a proposed next document state as a value object.
 *
 * A DocumentTransaction describes the complete next state of a document,
 * not individual editor operations or incremental edits.
 *
 * Transactions are immutable value objects that encapsulate a proposed change.
 *
 * They are intentionally independent of React, editors, persistence, and filesystem concerns.
 *
 * Their sole purpose is to describe a change that may be validated and committed by DocumentSession.
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
   * The complete canonical Markdown content proposed by this transaction.
   *
   * This Markdown represents the full document state that should become
   * the next document revision if the transaction is accepted.
   *
   * A transaction describes the next complete document state,
   * not an editor-specific operation.
   */
  public readonly markdown: string;

  /**
   * Indicates whether the proposed Markdown content is empty.
   *
   * Note that this does not determine whether the transaction changes the document.
   * Whether a transaction is a no-op is determined by comparing it with the current
   * revision during DocumentSession.commit().
   */
  public get isEmpty(): boolean {
    return this.markdown.length === 0;
  }

  /**
   * Compares the proposed document states represented by two transactions.
   *
   * This is intended for value comparison to determine if two transactions
   * propose the same document content.
   */
  public equals(other: DocumentTransaction): boolean {
    return this.markdown === other.markdown;
  }

  constructor(markdown: string) {
    this.markdown = markdown;
  }
}
