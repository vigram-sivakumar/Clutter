import type { HTMLAttributes } from 'react';

export type EditingTrigger = 'click' | 'doubleClick' | 'manual';

export interface EditableTextRef {
  /**
   * Begins an editing session.
   */
  begin(): void;

  /**
   * Commits the active editing session.
   */
  commit(): void;
}

type InternallyManagedProps =
  | 'aria-disabled'
  | 'children'
  | 'contentEditable'
  | 'dangerouslySetInnerHTML'
  | 'onBlur'
  | 'onChange'
  | 'onCompositionEnd'
  | 'onCompositionStart'
  | 'onInput'
  | 'onKeyDown'
  | 'role'
  | 'suppressContentEditableWarning'
  | 'tabIndex';

export interface EditableTextProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  InternallyManagedProps
> {
  /**
   * Current committed value.
   */
  value: string;

  /**
   * Placeholder shown when the value is empty.
   */
  placeholder?: string;

  /**
   * Determines how editing begins.
   *
   * @default "click"
   */
  editTrigger?: EditingTrigger;

  /**
   * Prevents the component from entering edit mode.
   */
  isDisabled?: boolean;

  /**
   * Called when the current draft is committed.
   *
   * Enter, Escape, blur, or an imperative commit can trigger this callback.
   */
  onCommit(value: string): void;
}
