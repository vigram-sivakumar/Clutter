export interface EditableTextProps {
  /**
   * Current committed value.
   */
  value: string;

  /**
   * Placeholder shown when the value is empty.
   */
  placeholder?: string;

  /**
   * Prevents the component from entering edit mode.
   */
  isDisabled?: boolean;

  /**
   * Focuses the element as soon as it mounts, for a row that renders
   * already in edit mode (e.g. a newly created, not-yet-named item) rather
   * than one the user clicks into.
   */
  autoFocus?: boolean;

  /**
   * Called when the current draft is committed to a new value.
   *
   * Only Enter or a blur with changed text trigger this — Escape never
   * does, regardless of what was typed (see onEditingEnd).
   */
  onCommit(value: string): void;

  /**
   * Called on every input event with the live, uncommitted draft text —
   * the same continuous-commit shape MarkdownEditor's onEdit already gives
   * the body (autosave-execution-model.md §3.1). Optional: a consumer that
   * only wants the final, blur/Enter-committed value (the folder-rename
   * and draft-title rows today) omits this and uses onCommit alone, same
   * as before this prop existed. A consumer that wants continuous,
   * debounced persistence while typing (a persisted page's title) supplies
   * this instead of relying on onCommit to drive persistence at all.
   *
   * Note for a continuous-commit consumer: Escape's existing "discard the
   * draft" behavior only resets what's visibly displayed — it cannot undo
   * an onEdit call already made before Escape was pressed. If an earlier
   * keystroke's commit was already autosaved (e.g. a debounce fired
   * mid-typing), Escape does not roll that back. This is a real, if
   * narrow, product trade-off of continuous autosave for a field that
   * previously supported discard-on-Escape — EditableText does not try to
   * solve it (no rollback/undo model exists in this architecture today,
   * per durability-model.md's explicit scope), it only surfaces the raw
   * events; the consumer's use of onEdit vs onCommit-only is what decides
   * whether this trade-off applies to a given field.
   */
  onEdit?(value: string): void;

  /**
   * Called on every blur, unconditionally — even when the text didn't
   * change (unlike onCommit, which only fires on a real change) and even
   * when the session was escaped. The continuous-commit counterpart to
   * onCommit's "final say" role for a discrete-commit consumer: mirrors
   * MarkdownEditor's onFlush ("blur means flush now, regardless of
   * debounce state"). Optional — a discrete-commit consumer that doesn't
   * use onEdit has no use for a separate flush signal, since onCommit
   * already tells it everything it needs.
   */
  onFlush?(): void;

  /**
   * Called when an editing session ends, whether or not it committed.
   *
   * This is the general "editing lifecycle" signal EditableText owns:
   * started (focus) -> optionally committed -> finished. A consumer that
   * needs to know "did this session end without a commit" (e.g. to remove
   * an ephemeral not-yet-named row) checks its own commit-tracking state
   * from within this callback rather than EditableText exposing a
   * cancel-specific outcome it would otherwise have no reason to know
   * about.
   */
  onEditingEnd?(): void;

  /**
   * Called specifically when Enter ended the session — never for Escape,
   * never for a plain blur. Distinct from onCommit (which only fires on a
   * changed value) and onEditingEnd (which fires for every outcome): a
   * consumer that wants to advance focus to the next field on Enter, but
   * not on Escape or an incidental blur, has no other way to tell which
   * key ended the session. Fires after onCommit/onEditingEnd, once both
   * have already run for this session.
   */
  onSubmit?(): void;
}

/**
 * Imperative handle for callers that need to move focus into an
 * already-mounted EditableText — e.g. advancing focus to it from a
 * sibling field's onSubmit. Kept minimal: focus is the only thing a
 * caller should ever need to do to this element from outside.
 */
export interface EditableTextHandle {
  focus(): void;
}
