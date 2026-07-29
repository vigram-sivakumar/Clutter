import type { ReactNode } from 'react';

import './Page.Body.css';

interface PageBodyProps {
  children: ReactNode;
  className?: string;
}

/**
 * Layout container for page body content.
 *
 * Responsibilities:
 * - Provide consistent page body layout.
 * - Apply page body styling.
 * - Render arbitrary child content.
 *
 * This component intentionally does not implement editing behavior.
 * Editable experiences should be composed by higher-level components.
 */
export function PageBody({ children, className }: PageBodyProps) {
  return (
    <div className={['page-content', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
