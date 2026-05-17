import type { ReactNode } from 'react';

type SidebarHoverRevealProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Hides children until the pointer is over the sidebar (desktop with fine pointer).
 * Always visible on touch / coarse-pointer devices.
 * Use only inside `.clutter-sidebar`.
 */
export function SidebarHoverReveal({
  children,
  className,
}: SidebarHoverRevealProps) {
  if (children == null || children === false) {
    return null;
  }

  return (
    <span
      className={['clutter-sidebar-hover-reveal', className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}
