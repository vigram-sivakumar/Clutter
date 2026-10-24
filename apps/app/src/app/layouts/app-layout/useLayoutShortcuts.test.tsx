// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));

import { ShortcutsProvider } from '@app/shortcuts/ShortcutsProvider';
import { useLayoutShortcuts } from './useLayoutShortcuts';

function Layout(props: Parameters<typeof useLayoutShortcuts>[0]) {
  useLayoutShortcuts(props);
  return null;
}

function setup(isSidebarVisible = true) {
  const navigation = { back: vi.fn(), forward: vi.fn() };
  const workspace = { setActiveSidebarTab: vi.fn() };
  const toggleSidebar = vi.fn();
  const openSearch = vi.fn();
  render(
    <ShortcutsProvider>
      <Layout navigation={navigation} workspace={workspace} isSidebarVisible={isSidebarVisible}
        toggleSidebar={toggleSidebar}
        openSearch={openSearch}
      />
    </ShortcutsProvider>
  );
  return { navigation, workspace, toggleSidebar, openSearch };
}

const press = (init: KeyboardEventInit & { code: string }) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, metaKey: true, ...init }));

beforeEach(() => void vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel'));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useLayoutShortcuts', () => {
  it('⌘[ and ⌘] go back and forward through the navigation history, not the editor’s undo', () => {
    const { navigation } = setup();
    press({ code: 'BracketLeft' });
    expect(navigation.back).toHaveBeenCalledOnce();
    expect(navigation.forward).not.toHaveBeenCalled();
    press({ code: 'BracketRight' });
    expect(navigation.forward).toHaveBeenCalledOnce();
  });

  it('⌘\\ toggles the sidebar', () => {
    const { toggleSidebar } = setup();
    press({ code: 'Backslash' });
    expect(toggleSidebar).toHaveBeenCalledOnce();
  });

  it('⌘1–⌘4 switch the sidebar tab and leave a visible sidebar alone', () => {
    const { workspace, toggleSidebar } = setup(true);
    press({ code: 'Digit1' });
    press({ code: 'Digit2' });
    press({ code: 'Digit3' });
    press({ code: 'Digit4' });
    expect(workspace.setActiveSidebarTab.mock.calls.map(([tab]) => tab)).toEqual([
      'notes',
      'daily-notes',
      'tasks',
      'tags',
    ]);
    expect(toggleSidebar).not.toHaveBeenCalled();
  });

  it('⌘K opens the Search overlay without switching tabs or showing the sidebar', () => {
    const { workspace, toggleSidebar, openSearch } = setup(false);
    press({ code: 'KeyK' });
    expect(openSearch).toHaveBeenCalledOnce();
    expect(workspace.setActiveSidebarTab).not.toHaveBeenCalled();
    expect(toggleSidebar).not.toHaveBeenCalled();
  });

  it('Ctrl+K opens the Search overlay on Windows and Linux', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    const { openSearch } = setup();
    press({ code: 'KeyK', metaKey: false, ctrlKey: true });
    expect(openSearch).toHaveBeenCalledOnce();
  });

  it('shows a collapsed sidebar when a tab shortcut needs it', () => {
    const { workspace, toggleSidebar } = setup(false);
    press({ code: 'Digit3' });
    expect(workspace.setActiveSidebarTab).toHaveBeenCalledWith('tasks');
    expect(toggleSidebar).toHaveBeenCalledOnce();
  });
});
