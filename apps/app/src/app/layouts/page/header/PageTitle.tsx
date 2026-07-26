import type { ReactNode } from 'react';

import './PageTitle.css';

interface PageTitleProps {
  children: ReactNode;
  className?: string;
}

export function PageTitle({ children, className }: PageTitleProps) {
  return (
    <div className={['page-title', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
