import type { ReactNode } from 'react';

import './Page.Body.css';

interface PageBodyProps {
  children: ReactNode;
  className?: string;
}

export function PageBody({ children, className }: PageBodyProps) {
  return (
    <div className={['page-content', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
