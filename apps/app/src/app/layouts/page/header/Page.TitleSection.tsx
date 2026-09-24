import type { HTMLAttributes, ReactNode } from 'react';
import './Page.TitleSection.css';

interface PageTitleSectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  /**
   * Trailing slot beside the title — same `actions?: ReactNode` pattern as
   * PageTopBar's own `actions` prop. Generic (not collection-specific);
   * Page.tsx's own `titleActions` prop is what a caller uses to supply
   * this, and only collection pages currently pass anything through it.
   */
  actions?: ReactNode;
}

export function PageTitleSection({
  title,
  description,
  actions,
  className,
  ...props
}: PageTitleSectionProps) {
  return (
    <header
      className={['page-title-section', className].filter(Boolean).join(' ')}
      {...props}
    >
      <div className="page-title-section__row">
        {title}
        {actions && <div className="page-title-section__actions">{actions}</div>}
      </div>
      {description}
    </header>
  );
}
