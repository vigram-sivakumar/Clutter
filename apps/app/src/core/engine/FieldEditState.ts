import { DocumentState } from './DocumentState';

/**
 * The same commit/dirty/Saving/SaveError lifecycle DocumentSession already
 * implements for markdown, generalized to any single scalar value — the
 * shared shape a page-level field (title today; description or a future
 * properties field are the same shape if they ever need debounced
 * autosave) needs to participate in SaveCoordinator's channel model.
 *
 * Deliberately not shared code with DocumentSession: DocumentSession's
 * commit() takes a DocumentTransaction and produces a numbered
 * DocumentRevision, is wired to React via subscribe/notify, and is
 * frozen behavior specified by autosave-execution-model.md — composing
 * FieldEditState underneath it would touch that already-tested,
 * carefully-specified state machine for a stylistic DRY concern with no
 * behavioral gain. Reusing DocumentState (the enum) rather than
 * duplicating its vocabulary is what actually matters for rule 4 here;
 * DocumentState's own doc comment already frames it as a reusable
 * lifecycle vocabulary, not a DocumentSession-specific business rule.
 *
 * Holds no reference to Page, Vault, or any domain concept — same
 * "editing engine knows nothing about identity" boundary ADR-018
 * establishes for DocumentSession, so a channel built on this class
 * (PageOperations' title-tracking, today) stays a caller-owned concern,
 * never something DocumentEditing itself needs to know about.
 */
export class FieldEditState<TValue> {
  private _currentValue: TValue;
  private _savedValue: TValue;
  private _state = DocumentState.Clean;

  constructor(initialValue: TValue) {
    this._currentValue = initialValue;
    this._savedValue = initialValue;
  }

  /**
   * Commits a new value in memory only — no save-lifecycle transition, no
   * persistence. A no-op once Disposed or for an unchanged value, mirroring
   * DocumentSession.commit()'s identical guards.
   */
  public commit(value: TValue): TValue {
    if (this._state === DocumentState.Disposed) {
      return this._currentValue;
    }

    if (value === this._currentValue) {
      return this._currentValue;
    }

    this._currentValue = value;

    return this._currentValue;
  }

  /** A no-op once Disposed — see commit()'s doc comment. */
  public beginSave(): void {
    if (this._state === DocumentState.Disposed) {
      return;
    }

    this._state = DocumentState.Saving;
  }

  /** A no-op once Disposed — see commit()'s doc comment. */
  public markSaved(value: TValue): void {
    if (this._state === DocumentState.Disposed) {
      return;
    }

    this._savedValue = value;
    this._state = DocumentState.Clean;
  }

  /** A no-op once Disposed — see commit()'s doc comment. */
  public markSaveFailed(): void {
    if (this._state === DocumentState.Disposed) {
      return;
    }

    this._state = DocumentState.SaveError;
  }

  /** Idempotent — a second call is a no-op, since Disposed is terminal. */
  public markDisposed(): void {
    if (this._state === DocumentState.Disposed) {
      return;
    }

    this._state = DocumentState.Disposed;
  }

  public get currentValue(): TValue {
    return this._currentValue;
  }

  public get savedValue(): TValue {
    return this._savedValue;
  }

  public get state(): DocumentState {
    return this._state;
  }

  public get isDirty(): boolean {
    return this._currentValue !== this._savedValue;
  }
}
