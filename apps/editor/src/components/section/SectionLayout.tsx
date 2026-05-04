import type { ReactNode } from 'react';

export type SectionLayoutProps = {
  /** Optional section title row (e.g. `Header` or a static label). */
  header?: ReactNode;
  /** List groups / `SectionGroupLayout` children. */
  children: ReactNode;
  /**
   * Adds padding under the groups region (Figma `sidebar/section/bottom-padding` — 12px;
   * e.g. Favorites list section in Clutter-Notes).
   */
  bottomPadding?: boolean;
  className?: string;
};

/**
 * Sidepanel section shell — optional header + groups slot (Figma: `Sidepanel/Section`, node 303:28699).
 */
export function SectionLayout({ header, children, bottomPadding = false, className }: SectionLayoutProps) {
  const rootCls = ['clutter-section-layout', className].filter(Boolean).join(' ');
  const groupsCls = [
    'clutter-section-layout__groups',
    bottomPadding && 'clutter-section-layout__groups--bottom-padding',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootCls}>
      {header != null ? <div className="clutter-section-layout__header">{header}</div> : null}
      <div className={groupsCls}>{children}</div>
    </div>
  );
}
