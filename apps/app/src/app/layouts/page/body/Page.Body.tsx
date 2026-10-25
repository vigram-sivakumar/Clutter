import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import './Page.Body.css';

interface PageBodyProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className'> {
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
export const PageBody = forwardRef<HTMLDivElement, PageBodyProps>(function PageBody(
  { children, className, ...props },
  ref
) {
  return (
    <div {...props} ref={ref} className={['page-content', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
});
