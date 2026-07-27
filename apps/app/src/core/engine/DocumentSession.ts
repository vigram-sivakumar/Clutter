import type { Page } from '../vault/models';
import { DocumentState } from './DocumentState';
import { DocumentRevision } from './DocumentRevision';
import { DocumentTransaction } from './DocumentTransaction';
/**
 * Represents the single authoritative editable version of an open page.
 *
 * Responsibilities:
 * - Own the live document content.
 * - Commit document transactions.
 * - Produce immutable document revisions.
 * - Maintain document state.
 * - Notify observers when committed revisions become available.
 *
 * Does NOT:
 * - Persist documents.
 * - Discover pages.
 * - Manage UI state.
 * - Manage workspace state.
 * - Produce vault-wide knowledge.
 *
 * Lifetime:
 * - Created by the DocumentRegistry.
 * - Shared by every view of the same page.
 * - Disposed when the DocumentRegistry closes the session.
 */
export class DocumentSession {
  /**
   * The page currently being edited.
   */
  private readonly _page: Page;

  /**
   * The latest committed revision.
   */
  private _currentRevision: DocumentRevision;

  /**
   * The latest revision successfully persisted.
   */
  private _savedRevision: DocumentRevision;

  /**
   * The current lifecycle state of this session.
   */
  private _state = DocumentState.Loading;

  constructor(page: Page) {
    this._page = page;

    const initialRevision = new DocumentRevision(0, page.source.markdown);

    this._currentRevision = initialRevision;
    this._savedRevision = initialRevision;
    this._state = DocumentState.Clean;
  }

  /**
   * Commits a proposed document transaction.
   *
   * A successful commit produces a new immutable revision,
   * which becomes the session's current revision.
   */
  public commit(transaction: DocumentTransaction): DocumentRevision {
    // Ignore no-op transactions to preserve a meaningful revision history.
    if (transaction.markdown === this._currentRevision.markdown) {
      return this._currentRevision;
    }
    const nextRevision = new DocumentRevision(
      this._currentRevision.number + 1,
      transaction.markdown
    );

    this._currentRevision = nextRevision;

    return nextRevision;
  }

  /**
   * Transitions the session into the Saving state.
   */
  public beginSave(): void {
    this._state = DocumentState.Saving;
  }

  /**
   * Marks the specified revision as successfully persisted.
   *
   * The supplied revision becomes the latest durable revision
   * known by this session.
   */
  public markSaved(revision: DocumentRevision): void {
    this._savedRevision = revision;
    this._state = DocumentState.Clean;
  }

  /**
   * The page owned by this session.
   */
  public get page(): Page {
    return this._page;
  }

  /**
   * The latest committed revision.
   */
  public get currentRevision(): DocumentRevision {
    return this._currentRevision;
  }

  /**
   * The current revision number.
   */
  public get revisionNumber(): number {
    return this._currentRevision.number;
  }

  /**
   * The latest persisted revision.
   */
  public get savedRevision(): DocumentRevision {
    return this._savedRevision;
  }

  /**
   * The current lifecycle state.
   */
  public get state(): DocumentState {
    return this._state;
  }

  /**
   * Indicates whether the document contains unpersisted changes.
   */
  public get isDirty(): boolean {
    return this._currentRevision !== this._savedRevision;
  }
}
