import type { ReactNode } from 'react';

import './Page.Description.css';

interface PageDescriptionProps {
  children: ReactNode;
  className?: string;
}

/**
 * Layer-1 rendering primitive.
 *
 * Responsible only for rendering description content.
 * Has no knowledge of notes, folders, daily notes, metadata, editing, or persistence.
 * Different page types should reuse this component whenever the rendering behaviour is the same.
 */
export function PageDescription({ children, className }: PageDescriptionProps) {
  return (
    <div className={['page-description', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
