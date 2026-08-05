import type { ReactNode } from 'react';
import { EditableText } from '@components/editable-text/EditableText';
import { getPageTitlePlaceholder } from '@core/presentation/PageDisplayPlaceholders';
import './Page.Title.css';

interface PageTitleProps {
  children: ReactNode;
  editable?: boolean;
  className?: string;
  placeholder?: string;
  /**
   * Focuses the title as soon as it mounts — Page computes this from
   * whether the title is missing (title === ''), not from any page-type
   * knowledge PageTitle itself doesn't have.
   */
  autoFocus?: boolean;
  /**
   * Fired specifically when Enter (not Escape, not a blur) commits the
   * title. Page uses this to advance focus to the editor.
   */
  onSubmit?(): void;
  /**
   * Fired when a changed title is committed (Enter or a blur with changed
   * text — see EditableText.onCommit). Optional: a persisted *page* still
   * has no rename() capability (ADR-012) and leaves this unset; the draft
   * branch and, since ADR-024, the folder branch (FolderOperations.rename())
   * both supply one.
   */
  onCommit?(value: string): void;
}

export function PageTitle({
  children,
  editable,
  className,
  // Only reached today for a persisted, untitled Note — PageHost passes an
  // explicit titlePlaceholder for the draft path, and a Daily Note's title
  // is never empty (isNoteUntitled is always false for daily-note), so
  // this default assumes 'note' rather than needing a type prop no caller
  // would otherwise use.
  placeholder = getPageTitlePlaceholder('note'),
  autoFocus,
  onSubmit,
  onCommit,
}: PageTitleProps) {
  return (
    <div className={['page-title', className].filter(Boolean).join(' ')}>
      {editable && typeof children === 'string' ? (
        <EditableText
          value={children}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onCommit={onCommit ?? (() => {})}
          onSubmit={onSubmit}
        />
      ) : (
        children
      )}
    </div>
  );
}
