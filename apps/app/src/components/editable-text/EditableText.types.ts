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
