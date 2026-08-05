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
   * text — see EditableText.onCommit). Optional: a Daily Note's title is
   * its permanent, date-derived calendar identity and leaves this unset
   * (PageHost's isRenameable guard). The draft and folder
   * (FolderOperations.rename(), ADR-024) branches supply this — both are
   * discrete-commit consumers with no debounced autosave of their own.
   * A persisted Note supplies onEdit/onFlush instead (below), not this —
   * PageOperations.rename() is still what physically persists a title
   * either way, only how often it's called differs.
   */
  onCommit?(value: string): void;

  /**
   * Continuous-commit counterpart to onCommit, for a persisted Note's
   * title: fired on every keystroke, driving PageOperations.commitTitle()'s
   * debounced-autosave channel (SaveCoordinator's title channel) instead of
   * committing only at blur/Enter. See EditableTextProps.onEdit's doc
   * comment for the Escape-cannot-undo-an-already-autosaved-keystroke
   * trade-off this implies for whichever field uses it.
   */
  onEdit?(value: string): void;

  /**
   * Continuous-commit counterpart to onSubmit-adjacent flush timing: fired
   * on every blur, unconditionally, asking the title channel to persist
   * now regardless of its own debounce state (PageOperations.
   * requestTitleSave()) — the same "blur always flushes" guarantee the
   * body already has via MarkdownEditor's onFlush.
   */
  onFlush?(): void;
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
  onEdit,
  onFlush,
}: PageTitleProps) {
  return (
    <div className={['page-title', className].filter(Boolean).join(' ')}>
      {editable && typeof children === 'string' ? (
        <EditableText
          value={children}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onCommit={onCommit ?? (() => {})}
          onEdit={onEdit}
          onFlush={onFlush}
          onSubmit={onSubmit}
        />
      ) : (
        children
      )}
    </div>
  );
}
