import './SidebarToggle.css';
import { useEffect, useRef } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

interface SidebarToggleProps {
  isSidebarVisible: boolean;
  onToggleSidebarVisible(): void;
}

/**
 * The one sidebar collapse/expand control — moved here from Controls
 * (formerly rendered inline inside .sidebar) so it can be positioned
 * independently of both the sidepanel (covered and non-interactive while
 * collapsed) and the page (the layer that slides). Rendered once, as a
 * sibling of .app-layout__sidepanel/.app-layout__page in AppLayout.tsx —
 * not duplicated per state. SidebarToggle.css repositions this single
 * instance via [data-sidebar-collapsed]: expanded, absolute coordinates
 * matching where Controls used to render it inline in the sidebar's own
 * top-left corner; collapsed, a stationary overlay anchored to
 * .app-layout itself, unaffected by the page sliding underneath it.
 */
export function SidebarToggle({ isSidebarVisible, onToggleSidebarVisible }: SidebarToggleProps) {
  const toggleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let frame = 0;
    let settle: ReturnType<typeof setTimeout>;
    const align = () => {
      const button = toggleRef.current?.querySelector('button');
      if (!button || window.innerHeight <= 0) return;
      const rect = button.getBoundingClientRect();
      if (rect.height <= 0) return;
      void invoke('align_traffic_lights', {
        centerY: rect.top + rect.height / 2,
        viewportHeight: window.innerHeight,
      }).catch((error) => console.warn('Could not align window controls:', error));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(align);
      clearTimeout(settle);
      // AppKit may lay out the titlebar again at the end of a fullscreen transition.
      settle = setTimeout(align, 500);
    };
    const observer = new ResizeObserver(schedule);
    if (toggleRef.current) observer.observe(toggleRef.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('focus', schedule);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('focus', schedule);
    };
  }, [isSidebarVisible]);

  return (
    <div ref={toggleRef} className="sidebar-toggle" data-tauri-drag-region>
      <Button
        isIconOnly
        size="medium"
        variant="ghost"
        // There is no active state for the sidebar-toggle button, as it is a toggle button that controls the visibility of the sidebar. The button's appearance does not change based on the sidebar's visibility, so we use aria-pressed to indicate its state instead.
        aria-pressed={isSidebarVisible}
        onClick={onToggleSidebarVisible}
      >
        <AppIcon icon="sidebar" />
      </Button>
    </div>
  );
}
