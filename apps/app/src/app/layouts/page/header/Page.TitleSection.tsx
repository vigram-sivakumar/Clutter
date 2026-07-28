import type { HTMLAttributes, ReactNode } from 'react';
import './Page.TitleSection.css';

interface PageTitleSectionProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

export function PageTitleSection({
  children,
  className,
  ...props
}: PageTitleSectionProps) {
  return (
    <header
      className={['page-title-section', className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </header>
  );
}
