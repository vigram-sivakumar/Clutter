// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The app-wide settings live in `localStorage`. A quit and relaunch discards every module and every in-memory
 * value but keeps `localStorage`, so each test here changes a setting, throws all modules away (`vi.resetModules`)
 * and imports them again — a fresh start over the same storage — and reads the setting back. This SIMULATES a
 * restart; it is not a manual quit and relaunch of the packaged app.
 */
const relaunch = () => vi.resetModules();

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});

describe('app-wide settings survive a restart', () => {
  it('Theme', async () => {
    const first = await import('@design-system/useTheme');
    const { result } = renderHook(() => first.useTheme());
    act(() => result.current.setPreference('dark'));

    relaunch();
    const second = await import('@design-system/useTheme');
    expect(renderHook(() => second.useTheme()).result.current.preference).toBe('dark');
  });

  it('Open on launch', async () => {
    (await import('@features/settings/startup-setting/startupPreference')).writeStartupBehavior('last-opened-note');

    relaunch();
    expect((await import('@features/settings/startup-setting/startupPreference')).readStartupBehavior()).toBe(
      'last-opened-note'
    );
  });

  it('Default sidebar tab, and whether to reopen the last one', async () => {
    const first = await import('@features/settings/sidebar-setting/defaultSidebarTab');
    first.writeDefaultSidebarTab('tags');
    first.writeUseLastSidebarTab(false);

    relaunch();
    const second = await import('@features/settings/sidebar-setting/defaultSidebarTab');
    expect(second.readDefaultSidebarTab()).toBe('tags');
    expect(second.readUseLastSidebarTab()).toBe(false);
  });

  it('Start week on Monday', async () => {
    (await import('@features/daily-notes/calendar/weekStart')).writeWeekStart('sunday');

    relaunch();
    expect((await import('@features/daily-notes/calendar/weekStart')).readWeekStart()).toBe('sunday');
  });

  it('Date format', async () => {
    (await import('./time/dateFormatPreference')).writeDateFormatChoice('ymd');

    relaunch();
    expect((await import('./time/dateFormatPreference')).readDateFormatChoice()).toBe('ymd');
  });

  it('Folder item limit', async () => {
    (await import('./folderItemLimitPreference')).writeFolderItemLimitChoice('all');

    relaunch();
    expect((await import('./folderItemLimitPreference')).readFolderItemLimitChoice()).toBe('all');
  });

  it('Show assets in folders', async () => {
    (await import('./showAssetsInFoldersPreference')).writeShowAssetsInFolders(false);

    relaunch();
    expect((await import('./showAssetsInFoldersPreference')).readShowAssetsInFolders()).toBe(false);
  });
});

describe('app-wide settings with nothing, or something unusable, stored use their defaults after a restart', () => {
  it.each([
    ['clutter-theme', async () => renderHook((await import('@design-system/useTheme')).useTheme).result.current.preference, 'system'],
    ['clutter-startup-behavior', async () => (await import('@features/settings/startup-setting/startupPreference')).readStartupBehavior(), 'todays-note'],
    ['clutter-default-sidebar-tab', async () => (await import('@features/settings/sidebar-setting/defaultSidebarTab')).readDefaultSidebarTab(), 'notes'],
    ['clutter-week-start', async () => (await import('@features/daily-notes/calendar/weekStart')).readWeekStart(), 'monday'],
    ['clutter-date-format', async () => (await import('./time/dateFormatPreference')).readDateFormatChoice(), 'relative'],
    ['clutter-folder-item-limit', async () => (await import('./folderItemLimitPreference')).readFolderItemLimitChoice(), 10],
    ['clutter-show-assets-in-folders', async () => (await import('./showAssetsInFoldersPreference')).readShowAssetsInFolders(), true],
  ] as const)('%s', async (key, read, expected) => {
    relaunch();
    expect(await read()).toBe(expected);

    for (const junk of ['', 'not-a-value', '{"x":1}', 'null']) {
      localStorage.setItem(key, junk);
      relaunch();
      expect(await read()).toBe(expected);
    }
  });
});

describe('app-wide settings do not depend on any Space', () => {
  it('all of them are plain localStorage keys, none inside a Space', async () => {
    (await import('./time/dateFormatPreference')).writeDateFormatChoice('mdy');
    (await import('./folderItemLimitPreference')).writeFolderItemLimitChoice(5);
    (await import('./showAssetsInFoldersPreference')).writeShowAssetsInFolders(false);

    expect(Object.keys(localStorage).sort()).toEqual([
      'clutter-date-format',
      'clutter-folder-item-limit',
      'clutter-show-assets-in-folders',
    ]);
  });

  it('the two settings that moved into the Space are no longer app-wide preferences: nothing writes their old keys', async () => {
    // Importing and using every app-wide preference module never touches the retired keys.
    (await import('./time/dateFormatPreference')).writeDateFormatChoice('mdy');
    (await import('./folderItemLimitPreference')).writeFolderItemLimitChoice(5);
    (await import('./showAssetsInFoldersPreference')).writeShowAssetsInFolders(false);

    expect(localStorage.getItem('clutter-default-cover-position')).toBeNull();
    expect(localStorage.getItem('clutter-auto-delete-archived')).toBeNull();
  });
});
