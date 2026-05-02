import type { HTMLAttributes, ReactNode } from 'react';

export interface CountProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  children: ReactNode;
}

/**
 * Muted meta count chip — list rows, nav, tabs (Figma: SidepanelNavigation “Count”).
 */
export function Count({ children, className, ...props }: CountProps) {
  const cls = ['clutter-count', className].filter(Boolean).join(' ');
  return (
    <span className={cls} {...props}>
      {children}
    </span>
  );
}
