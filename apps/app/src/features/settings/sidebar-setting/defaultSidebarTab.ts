import {
  SIDEBAR_TABS,
  type SidebarTab,
} from '@core/application/workspace/WorkspaceSessionStore';

const STORAGE_KEY = 'clutter-default-sidebar-tab';

export const DEFAULT_SIDEBAR_TAB: SidebarTab = 'notes';

/**
 * The tab the sidebar opens on at launch. A user-configured preference — kept apart from the sidebar's
 * current tab (`Workspace.activeSidebarTab`) and from the tab saved with the last session, neither of which
 * ever writes it. App-global like the theme: raw per-value localStorage, read when a Space opens (`AppShell`).
 */
export function readDefaultSidebarTab(): SidebarTab {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (SIDEBAR_TABS as readonly unknown[]).includes(stored)
      ? (stored as SidebarTab)
      : DEFAULT_SIDEBAR_TAB;
  } catch {
    return DEFAULT_SIDEBAR_TAB;
  }
}

export function writeDefaultSidebarTab(tab: SidebarTab): void {
  try {
    localStorage.setItem(STORAGE_KEY, tab);
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }
}

const USE_LAST_STORAGE_KEY = 'clutter-use-last-sidebar-tab';

/**
 * Whether launch reopens the tab the last session ended on instead of the configured default. Stored apart
 * from the default itself, so toggling it never overwrites the explicitly chosen tab.
 */
export function readUseLastSidebarTab(): boolean {
  try {
    // On unless explicitly turned off: a user with nothing saved reopens the tab they left.
    return localStorage.getItem(USE_LAST_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function writeUseLastSidebarTab(useLast: boolean): void {
  try {
    localStorage.setItem(USE_LAST_STORAGE_KEY, String(useLast));
  } catch {
    // Best-effort: an unwritable store only means the choice doesn't outlive this session.
  }
}

/**
 * The tab `Application.open()` should force at launch: the configured default, or `undefined` when "Use last
 * selected tab" is on — leaving the tab saved with the last session (seeded in bootstrap) in place.
 */
export function readLaunchSidebarTab(): SidebarTab | undefined {
  return readUseLastSidebarTab() ? undefined : readDefaultSidebarTab();
}
