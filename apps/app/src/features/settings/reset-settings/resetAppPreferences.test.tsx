// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetThemeStoreForTests, useTheme } from '@design-system/useTheme';
import { DEFAULT_WEEK_START, readWeekStart, useWeekStart, writeWeekStart } from '@features/daily-notes/calendar/weekStart';
import {
  DEFAULT_HEADER_SEPARATOR_MODE,
  DEFAULT_HEADER_SEPARATOR_STYLE,
  readHeaderSeparatorMode,
  readHeaderSeparatorStyle,
  useHeaderSeparatorMode,
  writeHeaderSeparatorMode,
  writeHeaderSeparatorStyle,
} from '@app/layouts/page/headerSeparator';
import { LEGACY_AUTO_DELETE_ARCHIVED_KEY, LEGACY_COVER_POSITION_KEY } from '@shared/helpers/legacyAppSettings';
import {
  DEFAULT_APPLY_TEMPLATE_COVER,
  readApplyTemplateCover,
  writeApplyTemplateCover,
} from '@shared/helpers/applyTemplateCoverPreference';
import {
  DEFAULT_APPLY_TEMPLATE_ICON,
  readApplyTemplateIcon,
  writeApplyTemplateIcon,
} from '@shared/helpers/applyTemplateIconPreference';
import {
  DEFAULT_FOLDER_ITEM_LIMIT_CHOICE,
  readFolderItemLimitChoice,
  writeFolderItemLimitChoice,
} from '@shared/helpers/folderItemLimitPreference';
import {
  DEFAULT_GROUP_TASKS_BY_DUE_DATE,
  readGroupTasksByDueDate,
  writeGroupTasksByDueDate,
} from '@shared/helpers/groupTasksByDueDatePreference';
import {
  DEFAULT_SHOW_ASSETS_IN_FOLDERS,
  readShowAssetsInFolders,
  writeShowAssetsInFolders,
} from '@shared/helpers/showAssetsInFoldersPreference';
import {
  DEFAULT_SHOW_DAILY_NOTE_EMOJI,
  readShowDailyNoteEmoji,
  writeShowDailyNoteEmoji,
} from '@shared/helpers/showDailyNoteEmojiPreference';
import {
  DEFAULT_SHOW_REFERENCES_AUTOMATICALLY,
  readShowReferencesAutomatically,
  writeShowReferencesAutomatically,
} from '@shared/helpers/showReferencesAutomaticallyPreference';
import { DEFAULT_SHOW_TAG_EMOJIS, readShowTagEmojis, writeShowTagEmojis } from '@shared/helpers/showTagEmojisPreference';
import {
  DEFAULT_TASK_ITEM_LIMIT_CHOICE,
  readTaskItemLimitChoice,
  writeTaskItemLimitChoice,
} from '@shared/helpers/taskItemLimitPreference';
import {
  DEFAULT_DATE_FORMAT_CHOICE,
  readDateFormatChoice,
  writeDateFormatChoice,
} from '@shared/helpers/time/dateFormatPreference';
import {
  DEFAULT_SIDEBAR_TAB,
  readDefaultSidebarTab,
  readUseLastSidebarTab,
  writeDefaultSidebarTab,
  writeUseLastSidebarTab,
} from '../sidebar-setting/defaultSidebarTab';
import { DEFAULT_STARTUP_BEHAVIOR, readStartupBehavior, writeStartupBehavior } from '../startup-setting/startupPreference';
import { resetAppPreferences } from './resetAppPreferences';

let systemDark = false;

beforeEach(() => {
  localStorage.clear();
  resetThemeStoreForTests();
  systemDark = false;
  window.matchMedia = ((query: string) => ({
    matches: query.includes('dark') && systemDark,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** Every app-wide preference, moved away from its default. */
function customizeEveryPreference() {
  writeStartupBehavior('last-opened-note');
  writeDefaultSidebarTab('tasks');
  writeUseLastSidebarTab(false);
  writeWeekStart('sunday');
  writeDateFormatChoice('ymd');
  writeFolderItemLimitChoice(20);
  writeShowAssetsInFolders(false);
  writeTaskItemLimitChoice(15);
  writeGroupTasksByDueDate(true);
  writeShowTagEmojis(false);
  writeShowDailyNoteEmoji(true);
  writeApplyTemplateIcon(false);
  writeApplyTemplateCover(false);
  writeShowReferencesAutomatically(false);
  writeHeaderSeparatorMode('hide');
  writeHeaderSeparatorStyle('wavy');
}

/** What is NOT a setting — interface layout and remembered picks — and must survive a settings reset. */
const NOT_SETTINGS: Record<string, string> = {
  'clutter-sidebar-width': '320',
  'clutter-cover-picker-source': 'unsplash',
  'clutter-emoji-skin-tone': '3',
  'clutter-gradient-grainy-last-palette': '2',
  'clutter.spaces.v1': '{"paths":["/a","/b"],"activePath":"/a"}',
  'some-other-app-key': 'kept',
};

describe('resetAppPreferences', () => {
  it('puts every app-wide preference back to its default', () => {
    customizeEveryPreference();
    // Sanity: they really were all moved.
    expect(readStartupBehavior()).not.toBe(DEFAULT_STARTUP_BEHAVIOR);
    expect(readFolderItemLimitChoice()).not.toBe(DEFAULT_FOLDER_ITEM_LIMIT_CHOICE);

    resetAppPreferences();

    expect(readStartupBehavior()).toBe(DEFAULT_STARTUP_BEHAVIOR);
    expect(readDefaultSidebarTab()).toBe(DEFAULT_SIDEBAR_TAB);
    expect(readUseLastSidebarTab()).toBe(true);
    expect(readWeekStart()).toBe(DEFAULT_WEEK_START);
    expect(readDateFormatChoice()).toBe(DEFAULT_DATE_FORMAT_CHOICE);
    expect(readFolderItemLimitChoice()).toBe(DEFAULT_FOLDER_ITEM_LIMIT_CHOICE);
    expect(readShowAssetsInFolders()).toBe(DEFAULT_SHOW_ASSETS_IN_FOLDERS);
    expect(readTaskItemLimitChoice()).toBe(DEFAULT_TASK_ITEM_LIMIT_CHOICE);
    expect(readGroupTasksByDueDate()).toBe(DEFAULT_GROUP_TASKS_BY_DUE_DATE);
    expect(readShowTagEmojis()).toBe(DEFAULT_SHOW_TAG_EMOJIS);
    expect(readShowDailyNoteEmoji()).toBe(DEFAULT_SHOW_DAILY_NOTE_EMOJI);
    expect(readApplyTemplateIcon()).toBe(DEFAULT_APPLY_TEMPLATE_ICON);
    expect(readApplyTemplateCover()).toBe(DEFAULT_APPLY_TEMPLATE_COVER);
    expect(readShowReferencesAutomatically()).toBe(DEFAULT_SHOW_REFERENCES_AUTOMATICALLY);
    expect(readHeaderSeparatorMode()).toBe(DEFAULT_HEADER_SEPARATOR_MODE);
    expect(readHeaderSeparatorStyle()).toBe(DEFAULT_HEADER_SEPARATOR_STYLE);
  });

  it('removes the saved values rather than writing the defaults — a missing value is the default', () => {
    customizeEveryPreference();
    expect(localStorage.length).toBeGreaterThan(10);

    resetAppPreferences();

    expect(localStorage.length).toBe(0);
  });

  it('puts the theme back to System, applies it, and tells every subscriber', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setPreference('dark'));
    expect(result.current.preference).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    systemDark = false;

    act(() => resetAppPreferences());

    expect(result.current.preference).toBe('system');
    expect(localStorage.getItem('clutter-theme')).toBeNull();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('tells mounted readers at once, so the UI follows without a reload', () => {
    writeWeekStart('sunday');
    writeHeaderSeparatorMode('hide');
    const week = renderHook(() => useWeekStart());
    const separator = renderHook(() => useHeaderSeparatorMode());
    expect(week.result.current).toBe('sunday');
    expect(separator.result.current).toBe('hide');

    act(() => resetAppPreferences());

    expect(week.result.current).toBe(DEFAULT_WEEK_START);
    expect(separator.result.current).toBe(DEFAULT_HEADER_SEPARATOR_MODE);
  });

  it('clears the old app-wide values, or a Space with no cover position of its own would be seeded from them again', () => {
    localStorage.setItem(LEGACY_COVER_POSITION_KEY, 'above');
    localStorage.setItem(LEGACY_AUTO_DELETE_ARCHIVED_KEY, 'true');

    resetAppPreferences();

    expect(localStorage.getItem(LEGACY_COVER_POSITION_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_AUTO_DELETE_ARCHIVED_KEY)).toBeNull();
  });

  it('leaves interface layout, remembered picks and the Space registry alone — they are not settings', () => {
    customizeEveryPreference();
    for (const [key, value] of Object.entries(NOT_SETTINGS)) localStorage.setItem(key, value);

    resetAppPreferences();

    const remaining = Object.fromEntries(
      Array.from({ length: localStorage.length }, (_, index) => {
        const key = localStorage.key(index)!;
        return [key, localStorage.getItem(key)];
      })
    );
    expect(remaining).toEqual(NOT_SETTINGS);
  });

  it('is idempotent: a second reset changes nothing and does not throw', () => {
    customizeEveryPreference();
    resetAppPreferences();

    expect(() => resetAppPreferences()).not.toThrow();
    expect(localStorage.length).toBe(0);
  });

  it('survives an unwritable store: it does not throw (the default only fails to outlive the session)', () => {
    customizeEveryPreference();
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('quota');
    });

    expect(() => resetAppPreferences()).not.toThrow();

    removeItem.mockRestore();
  });
});
