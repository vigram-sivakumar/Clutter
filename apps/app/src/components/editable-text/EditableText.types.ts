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
   * Called when the current draft is committed.
   *
   * Enter, Escape, or blur can trigger this callback.
   */
  onCommit(value: string): void;
}
