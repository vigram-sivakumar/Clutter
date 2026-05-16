import type { ReactNode } from 'react';

import '../styles/section.css';

export type SectionProps = {
  children?: ReactNode;
  className?: string;
};

export function Section({ children, className }: SectionProps) {
  const sectionClassName = ['clutter-section', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={sectionClassName}>
      <div className="clutter-section__body">{children}</div>
    </div>
  );
}

export type GroupProps = {
  children?: ReactNode;
  className?: string;
};

export function Group({ children, className }: GroupProps) {
  const groupClassName = ['clutter-section-group', className]
    .filter(Boolean)
    .join(' ');

  return <div className={groupClassName}>{children}</div>;
}
