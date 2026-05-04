import type { ReactNode } from 'react';

export type SectionGroupLayoutProps = {
  /** Optional group label row (e.g. `Subheader`). */
  subheader?: ReactNode;
  /** List rows, empty state, etc. */
  children: ReactNode;
  className?: string;
};

/**
 * One group under a section — optional subheader + list items (Figma: `Sidepanel/Section group`, node 307:10642).
 */
export function SectionGroupLayout({ subheader, children, className }: SectionGroupLayoutProps) {
  const rootCls = ['clutter-section-group-layout', className].filter(Boolean).join(' ');

  return (
    <div className={rootCls}>
      {subheader != null ? (
        <div className="clutter-section-group-layout__subheader">{subheader}</div>
      ) : null}
      <div className="clutter-section-group-layout__items">{children}</div>
    </div>
  );
}
