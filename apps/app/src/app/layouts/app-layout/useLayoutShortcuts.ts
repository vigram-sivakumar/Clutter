import { useShortcutHandlers } from '@app/shortcuts/ShortcutsProvider';
import type { SidebarTab } from '@core/application/workspace/WorkspaceSessionStore';

interface LayoutShortcutTargets {
  readonly navigation: {
    back(): void;
    forward(): void;
  };
  readonly workspace: { setActiveSidebarTab(tab: SidebarTab): void };
  readonly isSidebarVisible: boolean;
  readonly toggleSidebar: () => void;
  /** Opens the Search overlay (⌘K / Ctrl+K) — Search is an overlay, not a sidebar panel. */
  readonly openSearch: () => void;
}

/**
 * The shortcuts whose actions the layout owns: history, the sidebar and its tabs, and Search. Each runs the function the
 * matching control already runs — the top bar's back/forward buttons (`navigation.back()` / `forward()`, no-ops when
 * there is nothing to go to), the sidebar toggle and the sidebar's tab switcher.
 * A tab shortcut also shows the sidebar when it is collapsed, since the tab is only visible there.
 */
export function useLayoutShortcuts({
  navigation,
  workspace,
  isSidebarVisible,
  toggleSidebar,
  openSearch,
}: LayoutShortcutTargets): void {
  const showTab = (tab: SidebarTab) => () => {
    workspace.setActiveSidebarTab(tab);
    if (!isSidebarVisible) toggleSidebar();
  };
  useShortcutHandlers({
    'go-back': () => navigation.back(),
    'go-forward': () => navigation.forward(),
    'toggle-sidebar': toggleSidebar,
    'go-notes': showTab('notes'),
    'go-daily-notes': showTab('daily-notes'),
    'go-tasks': showTab('tasks'),
    'go-tags': showTab('tags'),
    'open-search': openSearch,
  });
}
