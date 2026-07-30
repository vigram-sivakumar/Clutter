import type { ReactNode } from 'react';
import { EditableText } from '@components/editable-text/EditableText';
import './Page.Title.css';

interface PageTitleProps {
  children: ReactNode;
  editable?: boolean;
  className?: string;
}

export function PageTitle({ children, editable, className }: PageTitleProps) {
  return (
    <div className={['page-title', className].filter(Boolean).join(' ')}>
      {editable && typeof children === 'string' ? (
        <EditableText
          value={children}
          placeholder="Untitled Note"
          onCommit={() => {}}
        />
      ) : (
        children
      )}
    </div>
  );
}
