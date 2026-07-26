import type { ReactNode } from 'react';

import './PageDescription.css';

interface PageDescriptionProps {
  children: ReactNode;
  className?: string;
}

export function PageDescription({ children, className }: PageDescriptionProps) {
  return (
    <div className={['page-description', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
