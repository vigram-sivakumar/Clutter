import { DocumentState } from './DocumentState';
import { DocumentRevision } from './DocumentRevision';
import { DocumentTransaction } from './DocumentTransaction';
/**
 * Represents the single authoritative editable version of an open document.
 *
 * Owns only the buffer under revision, identified by an opaque id — no
 * knowledge of Page, Vault, or whether that id is backed by anything
 * durable yet (see ADR-018). Domain identity (title, path, type,
 * persisted-or-not) is resolved by callers, not by this class.
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
 * - Shared by every view of the same document.
 * - Disposed when the DocumentRegistry closes the session.
 */
export class DocumentSession {
  /**
   * The opaque identity of the document being edited. Not necessarily
   * backed by a Vault page yet (see ADR-017's draft lifecycle).
   */
  private readonly _id: string;

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

  /**
   * Subscribed listeners for change notifications.
   */
  private listeners: Set<() => void> = new Set();

  constructor(id: string, initialMarkdown: string) {
    this._id = id;

    const initialRevision = new DocumentRevision(0, initialMarkdown);

    this._currentRevision = initialRevision;
    this._savedRevision = initialRevision;
    this._state = DocumentState.Clean;
  }

  /**
   * Commits a proposed document transaction.
   *
   * A successful commit produces a new immutable revision,
   * which becomes the session's current revision.
   *
   * A no-op once Disposed: Disposed is terminal (autosave-execution-model.md
   * §1.6 — "any pending timer or in-flight-save completion for it must be
   * inert"), so a commit that arrives after disposal (e.g. a keystroke
   * event racing session teardown) must not resurrect any other state,
   * consistent with this method's own existing no-op-transaction guard.
   */
  public commit(transaction: DocumentTransaction): DocumentRevision {
    if (this._state === DocumentState.Disposed) {
      return this._currentRevision;
    }
    // Ignore no-op transactions to preserve a meaningful revision history.
    if (transaction.markdown === this._currentRevision.markdown) {
      return this._currentRevision;
    }
    const nextRevision = new DocumentRevision(
      this._currentRevision.number + 1,
      transaction.markdown
    );

    this._currentRevision = nextRevision;
    this.notify();

    return nextRevision;
  }

  /**
   * Transitions the session into the Saving state.
   *
   * A no-op once Disposed — see commit()'s doc comment for why this guard
   * exists on every state-mutating method, not just markDisposed() itself.
   */
  public beginSave(): void {
    if (this._state === DocumentState.Disposed) {
      return;
    }

    this._state = DocumentState.Saving;
    this.notify();
  }

  /**
   * Marks the specified revision as successfully persisted.
   *
   * The supplied revision becomes the latest durable revision
   * known by this session.
   *
   * A no-op once Disposed: a save that was already in flight when the
   * session was disposed must not resurrect it back to Clean once that
   * save completes — see commit()'s doc comment.
   */
  public markSaved(revision: DocumentRevision): void {
    if (this._state === DocumentState.Disposed) {
      return;
    }

    this._savedRevision = revision;
    this._state = DocumentState.Clean;
    this.notify();
  }

  /**
   * Marks the session as having a persistence failure.
   *
   * The current revision is intentionally preserved so the user's work remains
   * available for retry after the failure is resolved.
   *
   * A no-op once Disposed — see commit()'s doc comment.
   */
  public markSaveFailed(): void {
    if (this._state === DocumentState.Disposed) {
      return;
    }

    this._state = DocumentState.SaveError;
    this.notify();
  }

  /**
   * Transitions the session into the terminal Disposed state.
   *
   * Called by DocumentRegistry when the session is closed, so anything still
   * holding a reference (a scheduled timer, an in-flight save's completion
   * handler) can observe that this session is no longer live rather than
   * silently acting on a session removed from the registry. Idempotent: a
   * second call is a no-op, since Disposed is terminal.
   */
  public markDisposed(): void {
    if (this._state === DocumentState.Disposed) {
      return;
    }

    this._state = DocumentState.Disposed;
    this.notify();
  }

  /**
   * DocumentSession exposes change notifications so higher layers can observe
   * revision and lifecycle changes without introducing UI or persistence responsibilities.
   *
   * Subscribe to session changes. Returns an unsubscribe function.
   */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notifies all subscribed listeners of a change.
   */
  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * The opaque identity of the document owned by this session.
   */
  public get id(): string {
    return this._id;
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
