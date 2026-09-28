import type { ReactNode } from 'react';
import { EditableText } from '@components/editable-text/EditableText';

import './Page.Description.css';

interface PageDescriptionProps {
  children: ReactNode;
  editable?: boolean;
  className?: string;
  placeholder?: string;
  /**
   * Focuses the description as soon as it mounts — Page computes this from
   * whether the description editor was just opened while still empty
   * (mirrors PageTitle's own autoFocus, which fires from title === '').
   */
  autoFocus?: boolean;
  /**
   * Fired when a changed description commits (Enter or a blur with changed
   * text — see EditableText.onCommit). Only the draft branch supplies
   * this — a still-unpersisted draft has no debounced-autosave channel of
   * its own, mirroring PageTitle's onCommit/draft relationship exactly.
   */
  onCommit?(value: string): void;
  /**
   * Continuous-commit counterpart to onCommit, for a persisted Note or
   * Folder's description: fired on every keystroke, driving
   * PageOperations.commitDescription()/FolderOperations.commitDescription()'s
   * debounced-autosave channel instead of committing only at blur/Enter.
   */
  onEdit?(value: string): void;
  /**
   * Continuous-commit counterpart to onEdit: fired on every non-escaped
   * blur, asking the description channel to persist now regardless of its
   * own debounce state.
   */
  onFlush?(): void;
  /**
   * Fired specifically on Escape — reverts the description channel's
   * pending value back to whatever's actually persisted and cancels its
   * timer.
   */
  onCancel?(): void;
}

/**
 * Layer-1 rendering primitive — mirrors Page.Title.tsx exactly, reusing the
 * same EditableText primitive rather than a second contentEditable
 * implementation. Non-editable rendering (children as-is) is unchanged
 * from before description editing existed; different page types reuse this
 * component whenever the rendering behavior is the same.
 */
export function PageDescription({
  children,
  editable,
  className,
  placeholder = 'Add a description…',
  autoFocus,
  onCommit,
  onEdit,
  onFlush,
  onCancel,
}: PageDescriptionProps) {
  return (
    <div className={['page-description', className].filter(Boolean).join(' ')}>
      {editable && typeof children === 'string' ? (
        <EditableText
          value={children}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onCommit={onCommit ?? (() => {})}
          onEdit={onEdit}
          onFlush={onFlush}
          onCancel={onCancel}
        />
      ) : (
        children
      )}
    </div>
  );
}
