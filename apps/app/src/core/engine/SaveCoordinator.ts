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
 * Coordinates persistence for committed document revisions — and, more
 * generally, for any *channel* of persistable content belonging to a
 * document (autosave-execution-model.md §9's "Rename" row anticipated this:
 * "a debounced title-autosave would be a second SaveCoordinator-managed
 * timer of the same kind... not a new state, not a new coalescing rule").
 *
 * A channel is identified by a plain string key — the body channel uses a
 * page's session id directly (unchanged from before channels existed);
 * any other channel (title today; description/icon/cover/properties are
 * the same shape if they ever need debounced autosave) uses a
 * caller-chosen, distinctly-suffixed key (e.g. `${pageId}:title}`) so its
 * timers and stale-completion tracking can never collide with the body
 * channel's. Channels are deliberately *not* forced to share one timer
 * pair or one dirty flag — see completeChannelSave()'s doc comment for
 * why a shared flag would silently couple every channel to the same
 * persistence cadence, defeating the reason a second channel like title
 * exists (its own, likely longer, debounce/ceiling — a file rename is
 * materially more expensive than an in-place content rewrite).
 *
 * Responsibilities:
 * - Decide when a committed value should be persisted, per channel.
 * - Coordinate autosave.
 * - Coordinate manual saves.
 * - Track save progress, per channel.
 *
 * Does NOT:
 * - Edit documents.
 * - Create document revisions.
 * - Produce PageFacts.
 * - Manage document sessions.
 * - Know what any channel's value *means* (title, markdown, or otherwise)
 *   — it tracks opaque values for staleness comparison only.
 *
 * Lifetime:
 * - Ownership is intentionally left unspecified as it is an application composition concern.
 * - Exists while the vault is open.
 */
export class SaveCoordinator {
  /**
   * Values currently being persisted, keyed by channel key. Body entries
   * store a DocumentRevision (compared by object identity, unchanged from
   * before channels existed); other channels store whatever value type
   * they use (title: a plain string, compared by value — see
   * completeChannelSave()'s doc comment for the one resulting nuance).
   * Tracks these to detect duplicate or stale save completions.
   */
  private readonly activeSaves = new Map<string, unknown>();

  /**
   * Debounce timer handles, keyed by channel key. Reset (cleared and
   * re-armed) on every real commit — see scheduleSave(). At most one entry
   * per key at any time; never two debounce timers for the same channel.
   */
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Ceiling timer handles, keyed by channel key. Armed once per dirty
   * streak (only when no entry already exists) and deliberately never
   * reset by subsequent commits — this is what bounds an unbroken typing
   * session (autosave-strategy-analysis.md §1). At most one entry per key
   * at any time.
   */
  private readonly ceilingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Arms/resets a channel's autosave timers in response to a real
   * (non-no-op) commit — the mechanical half of autosave scheduling
   * (autosave-execution-model.md §5), generalized from "per session" to
   * "per channel key" so a second channel (title) can be timed
   * independently of the body. `onFire` is a caller-supplied closure
   * (PageOperations.requestSave()/requestTitleSave() for this key),
   * invoked unconditionally whenever either timer expires — this method
   * never inspects DocumentState or decides whether a save is actually
   * warranted; that decision belongs entirely to evaluate(), which
   * `onFire`'s own target already calls. Keeping this method policy-free
   * is what keeps the callback direction one-way: it only ever calls a
   * function it was handed, never reaches back into PageOperations on its
   * own initiative (autosave-ownership.md §3/§4).
   *
   * `options` lets a channel use a different cadence than the body's
   * defaults (AUTOSAVE_DEBOUNCE_MS/AUTOSAVE_CEILING_MS) — the mechanism
   * every channel shares; the values are a per-channel policy choice made
   * by the caller, not by this method.
   *
   * Debounce: always cleared and re-armed. Ceiling: armed only if not
   * already armed for this key — never reset once started.
   */
  public scheduleSave(
    key: string,
    onFire: () => void,
    options?: { readonly debounceMs?: number; readonly ceilingMs?: number }
  ): void {
    const debounceMs = options?.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
    const ceilingMs = options?.ceilingMs ?? AUTOSAVE_CEILING_MS;

    const existingDebounce = this.debounceTimers.get(key);
    if (existingDebounce !== undefined) {
      clearTimeout(existingDebounce);
    }
    const debounceHandle = setTimeout(() => {
      this.debounceTimers.delete(key);
      onFire();
    }, debounceMs);
    this.debounceTimers.set(key, debounceHandle);

    if (!this.ceilingTimers.has(key)) {
      const ceilingHandle = setTimeout(() => {
        this.ceilingTimers.delete(key);
        onFire();
      }, ceilingMs);
      this.ceilingTimers.set(key, ceilingHandle);
    }
  }

  /**
   * Clears both timers for the given channel key, if armed. Called when a
   * channel becomes fully caught up (see completeSave()/completeChannelSave())
   * and when a session is closed (PageOperations.close()/delete()) — the
   * two moments autosave-execution-model.md §5 names as requiring
   * cancellation. Safe to call for a key with no armed timers (no-op).
   */
  public cancelTimers(key: string): void {
    const debounce = this.debounceTimers.get(key);
    if (debounce !== undefined) {
      clearTimeout(debounce);
      this.debounceTimers.delete(key);
    }

    const ceiling = this.ceilingTimers.get(key);
    if (ceiling !== undefined) {
      clearTimeout(ceiling);
      this.ceilingTimers.delete(key);
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
   * Decides whether a save request for the given channel should execute or
   * be suppressed, per autosave-execution-model.md §4.1's coalescing table
   * — generalized from "the session's own state" to explicit (state,
   * isDirty) inputs so the identical decision applies to any channel, not
   * only the DocumentSession-backed body one. Body call sites pass
   * `session.state, session.isDirty`; a FieldEditState-backed channel
   * (title) passes its own `state, isDirty` the same way.
   *
   * A pure function of its two inputs — no side effects, no mutation, safe
   * to call as many times as a trigger fires without changing anything on
   * its own. Every row of §4.1's table:
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
  public evaluate(state: DocumentState, isDirty: boolean): SaveDecision {
    switch (state) {
      case DocumentState.Clean:
      case DocumentState.SaveError:
        return isDirty ? 'execute' : 'suppress';
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
   * Records `value` as the in-flight save for a non-DocumentSession
   * channel (title today). Mirrors what beginSave(session) does
   * internally (capture the value being saved into activeSaves) but
   * doesn't call any state-transition method itself — a generic channel's
   * target (FieldEditState) isn't assumed to have any particular shape
   * beyond `state`/`isDirty` (which evaluate() already takes explicitly);
   * the caller (PageOperations) calls `target.beginSave()` itself, the
   * same way it already calls `session.commit()` itself before ever
   * reaching SaveCoordinator for the body channel.
   */
  public beginChannelSave(channelKey: string, value: unknown): void {
    this.activeSaves.set(channelKey, value);
  }

  /**
   * Reports whether `value` is still the tracked in-flight save for
   * `channelKey` — the generic counterpart to completeSave()'s stale-guard,
   * for a channel whose target has no DocumentRevision-shaped value to
   * compare by object identity. Returns `true` (and clears the tracked
   * entry) if this completion is current, `false` if a newer save for the
   * same channel has since superseded it; the caller decides what to do
   * with that answer (call `target.markSaved(value)` on `true`, ignore the
   * stale completion on `false`) exactly as completeSave() does inline for
   * DocumentSession.
   *
   * Comparison is by `===`, which is value equality for a primitive
   * (title: two saves of the exact same string are indistinguishable, and
   * treating them as "the same" is harmless since the outcome is
   * identical either way) rather than the object-identity equality a
   * DocumentRevision comparison gets for free — a deliberate, minor
   * asymmetry from completeSave(), not a bug: a primitive channel has no
   * other identity to compare by.
   */
  public completeChannelSave(channelKey: string, value: unknown): boolean {
    const active = this.activeSaves.get(channelKey);

    if (active !== value) {
      return false;
    }

    this.activeSaves.delete(channelKey);

    return true;
  }

  /** The generic counterpart to failSave() — see completeChannelSave()'s doc comment. */
  public failChannelSave(channelKey: string, value: unknown): boolean {
    const active = this.activeSaves.get(channelKey);

    if (active !== value) {
      return false;
    }

    this.activeSaves.delete(channelKey);

    return true;
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
