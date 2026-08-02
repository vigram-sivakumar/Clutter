import type { ReactNode } from 'react';
import { EditableText } from '@components/editable-text/EditableText';
import { getPageTitlePlaceholder } from '@core/presentation/PageDisplayPlaceholders';
import './Page.Title.css';

interface PageTitleProps {
  children: ReactNode;
  editable?: boolean;
  className?: string;
  placeholder?: string;
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
}: PageTitleProps) {
  return (
    <div className={['page-title', className].filter(Boolean).join(' ')}>
      {editable && typeof children === 'string' ? (
        <EditableText value={children} placeholder={placeholder} onCommit={() => {}} />
      ) : (
        children
      )}
    </div>
  );
}
