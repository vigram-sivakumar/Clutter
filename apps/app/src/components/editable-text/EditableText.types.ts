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
}
