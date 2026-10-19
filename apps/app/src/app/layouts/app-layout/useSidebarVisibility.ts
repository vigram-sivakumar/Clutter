import { useEffect } from 'react';

/**
 * A manual toggle made while the window is narrow. It is temporary (never persisted) and lasts until the window
 * is next wide. Owned by whatever outlives the layout — the shell, which rebuilds the layout for every Space —
 * so switching Spaces never throws it away.
 */
export type NarrowSidebarOverride = boolean | null;

interface SidebarWorkspace {
  readonly isSidebarVisible: boolean;
  toggleSidebarVisible(): void;
}

/**
 * Whether the sidebar is shown, and the toggle that changes it.
 *
 * `workspace.isSidebarVisible` is the manual preference and is never written by a resize. Narrow (at or below the
 * collapse breakpoint), the sidebar is collapsed regardless of it, and a manual toggle becomes a temporary
 * override — kept by the caller, not here, because this hook's own state dies with the layout it lives in.
 */
export function useSidebarVisibility(
  workspace: SidebarWorkspace,
  isNarrow: boolean,
  narrowOverride: NarrowSidebarOverride,
  setNarrowOverride: (override: NarrowSidebarOverride) => void
): { isSidebarVisible: boolean; toggleSidebar: () => void } {
  // The override only means something while narrow: leaving the narrow range ends it, so it can't come back
  // as a stale choice the next time the window is narrowed.
  useEffect(() => {
    if (!isNarrow) setNarrowOverride(null);
  }, [isNarrow, setNarrowOverride]);

  const isSidebarVisible = isNarrow ? (narrowOverride ?? false) : workspace.isSidebarVisible;

  function toggleSidebar(): void {
    if (isNarrow) {
      setNarrowOverride(!isSidebarVisible);
    } else {
      workspace.toggleSidebarVisible();
    }
  }

  return { isSidebarVisible, toggleSidebar };
}
