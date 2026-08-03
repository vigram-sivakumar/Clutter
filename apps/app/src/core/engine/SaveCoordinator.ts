import { DocumentRevision } from './DocumentRevision';
import { DocumentSession } from './DocumentSession';
import { DocumentState } from './DocumentState';

/**
 * The outcome of evaluating a save request against a session's current
 * lifecycle state and dirty status (see SaveCoordinator.evaluate).
 *
 * 'execute' — begin a save for the session's current revision.
 * 'suppress' — do nothing; either there is nothing new to persist, a save
 * for this exact content is already in flight, or the session cannot
 * accept a save request right now (disposed).
 *
 * There is no third 'defer' outcome: a request arriving while a save is
 * already in flight for genuinely newer content evaluates to 'suppress'
 * here — the restart is realized by the save-completion path re-checking
 * isDirty once the in-flight save resolves, not by this method tracking a
 * separate deferred-request flag (autosave-execution-model.md §4.1's own
 * "Note on pendingRequeue").
 */
export type SaveDecision = 'execute' | 'suppress';

/**
 * Debounce window: how long to wait after the *last* commit before
 * autosaving, reset on every commit (autosave-execution-model.md §5).
 * Ceiling: the maximum time a continuously-dirty session can go without an
 * autosave attempt, armed once per dirty streak and never reset.
 *
 * Both are placeholder values, not tuned ones — autosave-strategy-analysis.md
 * §7 Risk 3 explicitly defers exact tuning as a product decision, separate
 * from this architecture. Exported so changing them later is a one-line
 * edit, not a design change.
 */
export const AUTOSAVE_DEBOUNCE_MS = 2000;
export const AUTOSAVE_CEILING_MS = 30000;

/**
 * Coordinates persistence for committed document revisions.
 *
 * Responsibilities:
 * - Decide when a committed revision should be persisted.
 * - Coordinate autosave.
 * - Coordinate manual saves.
 * - Track save progress.
 *
 * Does NOT:
 * - Edit documents.
 * - Create document revisions.
 * - Produce PageFacts.
 * - Manage document sessions.
 *
 * Lifetime:
 * - Ownership is intentionally left unspecified as it is an application composition concern.
 * - Exists while the vault is open.
 */
export class SaveCoordinator {
  /**
   * Revisions currently being persisted, keyed by document id.
   * Tracks these to detect duplicate or stale save completions in the future.
   */
  private readonly activeSaves = new Map<string, DocumentRevision>();

  /**
   * Debounce timer handles, keyed by session id. Reset (cleared and
   * re-armed) on every real commit — see scheduleSave(). At most one entry
   * per id at any time; never two debounce timers for the same session.
   */
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Ceiling timer handles, keyed by session id. Armed once per dirty
   * streak (only when no entry already exists) and deliberately never
   * reset by subsequent commits — this is what bounds an unbroken typing
   * session (autosave-strategy-analysis.md §1). At most one entry per id
   * at any time.
   */
  private readonly ceilingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Arms/resets the per-session autosave timers in response to a real
   * (non-no-op) commit — the mechanical half of autosave scheduling
   * (autosave-execution-model.md §5). `onFire` is a caller-supplied
   * closure (PageOperations.requestSave for this session's id), invoked
   * unconditionally whenever either timer expires — this method never
   * inspects DocumentState or decides whether a save is actually
   * warranted; that decision belongs entirely to evaluate(), which
   * `onFire`'s own target (requestSave()) already calls. Keeping this
   * method policy-free is what keeps the callback direction one-way: it
   * only ever calls a function it was handed, never reaches back into
   * PageOperations on its own initiative (autosave-ownership.md §3/§4).
   *
   * Debounce: always cleared and re-armed. Ceiling: armed only if not
   * already armed for this id — never reset once started.
   */
  public scheduleSave(session: DocumentSession, onFire: () => void): void {
    const id = session.id;

    const existingDebounce = this.debounceTimers.get(id);
    if (existingDebounce !== undefined) {
      clearTimeout(existingDebounce);
    }
    const debounceHandle = setTimeout(() => {
      this.debounceTimers.delete(id);
      onFire();
    }, AUTOSAVE_DEBOUNCE_MS);
    this.debounceTimers.set(id, debounceHandle);

    if (!this.ceilingTimers.has(id)) {
      const ceilingHandle = setTimeout(() => {
        this.ceilingTimers.delete(id);
        onFire();
      }, AUTOSAVE_CEILING_MS);
      this.ceilingTimers.set(id, ceilingHandle);
    }
  }

  /**
   * Clears both timers for the given session id, if armed. Called when a
   * session becomes fully caught up (see completeSave()) and when a
   * session is closed (PageOperations.close()/delete()) — the two moments
   * autosave-execution-model.md §5 names as requiring cancellation. Safe
   * to call for an id with no armed timers (no-op).
   */
  public cancelTimers(sessionId: string): void {
    const debounce = this.debounceTimers.get(sessionId);
    if (debounce !== undefined) {
      clearTimeout(debounce);
      this.debounceTimers.delete(sessionId);
    }

    const ceiling = this.ceilingTimers.get(sessionId);
    if (ceiling !== undefined) {
      clearTimeout(ceiling);
      this.ceilingTimers.delete(sessionId);
    }
  }

  /**
   * Clears every armed timer for every session, unconditionally. Used only
   * at whole-vault teardown (Application.close(), alongside
   * DocumentRegistry.clear() — the bulk counterpart to cancelTimers(),
   * found to be necessary during M5's pre-implementation audit: clear()
   * removes every session at once without going through
   * PageOperations.close()/delete(), so nothing else would cancel their
   * timers otherwise. Not a per-edit hot path — safe to be O(n) in the
   * number of currently-dirty sessions, since it runs exactly once, at
   * shutdown.
   */
  public cancelAllTimers(): void {
    for (const handle of this.debounceTimers.values()) {
      clearTimeout(handle);
    }
    this.debounceTimers.clear();

    for (const handle of this.ceilingTimers.values()) {
      clearTimeout(handle);
    }
    this.ceilingTimers.clear();
  }

  /**
   * Decides whether a save request for the given session should execute or
   * be suppressed, per autosave-execution-model.md §4.1's coalescing table.
   *
   * A pure function of the session's own state — no side effects, no
   * mutation, safe to call as many times as a trigger fires without
   * changing anything on its own. Every row of §4.1's table:
   *
   *   Clean    + not dirty -> suppress (duplicate suppression — nothing
   *                            changed since the last successful save)
   *   Clean    + dirty     -> execute  (the ordinary case)
   *   SaveError+ dirty     -> execute  (SaveError's only exit — "retry" is
   *                            just the next non-suppressed request)
   *   SaveError+ not dirty -> unreachable in practice (the only way isDirty
   *                            becomes false is a successful save, which
   *                            isn't how SaveError is entered) — falls
   *                            through the same branch as Clean, listed
   *                            for completeness, not specially handled.
   *   Saving   + not dirty -> suppress (a save for exactly this content is
   *                            already in flight)
   *   Saving   + dirty     -> suppress (the "defer" row — see the
   *                            SaveDecision doc comment above for why this
   *                            isn't a third outcome)
   *   Disposed + either    -> suppress, unconditionally
   *   Conflict + either    -> suppress (out of scope for autosave — reserved
   *                            for a future Sync-owned feature, never
   *                            reachable via any trigger this document
   *                            defines)
   *   Loading  + either    -> suppress (unreachable in practice — no session
   *                            is ever observed in Loading today)
   */
  public evaluate(session: DocumentSession): SaveDecision {
    switch (session.state) {
      case DocumentState.Clean:
      case DocumentState.SaveError:
        return session.isDirty ? 'execute' : 'suppress';
      case DocumentState.Saving:
      case DocumentState.Disposed:
      case DocumentState.Conflict:
      case DocumentState.Loading:
        return 'suppress';
    }
  }

  /**
   * Marks the beginning of a save operation.
   *
   * This method captures the session's current revision, transitions the session into the Saving lifecycle state,
   * records that revision as the active save, and returns the revision that should be persisted.
   */
  public beginSave(session: DocumentSession): DocumentRevision {
    const revision = session.currentRevision;

    session.beginSave();

    this.activeSaves.set(session.id, revision);

    return revision;
  }

  /**
   * Marks a save operation as successfully completed for a given session and revision.
   *
   * This currently finalizes the in-memory save lifecycle only. Once persistence is integrated,
   * filesystem writes should call this method only after a successful write.
   *
   * If the revision does not match the tracked in-progress revision, the completion is ignored.
   * This prevents stale save completions from overwriting newer edits.
   *
   * Cancels this session's autosave timers if it's now fully caught up
   * (autosave-execution-model.md §5: "both timers are cleared together the
   * moment the session becomes clean"). If new content committed while
   * this save was in flight, the session is still dirty here — timers are
   * deliberately left untouched in that case, since PageOperations.
   * requestSave()'s own loop (M4) is what drives the restart, not a timer.
   */
  public completeSave(
    session: DocumentSession,
    revision: DocumentRevision
  ): void {
    // Retrieve the tracked revision for this session.
    const activeRevision = this.activeSaves.get(session.id);
    if (activeRevision !== revision) {
      // Prevent stale save completions from overwriting newer edits.
      return;
    }
    // Mark the session as saved with this revision.
    session.markSaved(revision);
    // Remove from active saves.
    this.activeSaves.delete(session.id);

    if (!session.isDirty) {
      this.cancelTimers(session.id);
    }
  }

  /**
   * Marks a save operation as failed.
   *
   * Stale failures are ignored using the same revision guard as successful
   * completions. The failed revision remains in DocumentSession so it can be
   * retried or recovered later.
   */
  public failSave(session: DocumentSession, revision: DocumentRevision): void {
    const activeRevision = this.activeSaves.get(session.id);

    if (activeRevision !== revision) {
      return;
    }

    session.markSaveFailed();
    this.activeSaves.delete(session.id);
  }

  /**
   * Rejects a save request that never actually began — no beginSave() was
   * ever called for it, so there is no in-flight revision to guard against
   * a stale completion for (unlike failSave(), which exists precisely to
   * ignore a late-arriving failure for a save a newer one has since
   * superseded). This is the synchronous-validation-failure path
   * (autosave-execution-model.md §1.3a's T11a — an archived page, or a
   * missing session, rejected by PageOperations.save() before it ever
   * calls beginSave()): there is nothing to supersede, because nothing
   * started, so no revision-matching guard is needed or correct here.
   *
   * Unconditional: always transitions the session to SaveError.
   */
  public rejectSaveRequest(session: DocumentSession): void {
    session.markSaveFailed();
  }
}
