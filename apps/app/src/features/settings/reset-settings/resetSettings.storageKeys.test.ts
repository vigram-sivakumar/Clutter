// @vitest-environment jsdom

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetAppPreferences } from './resetAppPreferences';

/**
 * Every `localStorage` key the app declares is either a setting — put back to its default by "Reset settings to
 * defaults" — or deliberately not one. This fails the moment a key is added without being put on one side, so a new
 * setting cannot quietly survive the reset (and a new layout or remembered-pick key cannot quietly be wiped by it).
 */

/** Settings, and the old app-wide values the migration seeds Spaces from: `resetAppPreferences` removes each. */
const RESET_KEYS = [
  'clutter-theme',
  'clutter-startup-behavior',
  'clutter-default-sidebar-tab',
  'clutter-use-last-sidebar-tab',
  'clutter-week-start',
  'clutter-date-format',
  'clutter-folder-item-limit',
  'clutter-show-assets-in-folders',
  'clutter-task-item-limit',
  'clutter-group-tasks-by-due-date',
  'clutter-show-tag-emojis',
  'clutter-show-daily-note-emoji',
  'clutter-apply-template-icon',
  'clutter-apply-template-cover',
  'clutter-show-references-automatically',
  'clutter-header-separator',
  'clutter-header-separator-style',
  'clutter-markdown-italic-font',
  // Legacy: read only to seed a Space once; left in place they would undo a reset.
  'clutter-default-cover-position',
  'clutter-auto-delete-archived',
] as const;

/** Not settings: interface layout, remembered picks and the Space registry. A settings reset leaves them. */
const KEPT_KEYS = [
  'clutter-sidebar-width',
  'clutter-cover-picker-source',
  'clutter-emoji-skin-tone',
  'clutter-gradient-grainy-last-palette',
  'clutter.spaces.v1',
] as const;

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The keys declared as `STORAGE_KEY = 'clutter-…'` (or any `…_KEY = 'clutter…'`) in production code. */
function declaredStorageKeys(): string[] {
  const keys = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    for (const match of readFileSync(file, 'utf8').matchAll(/\b[A-Z][A-Z_]*KEY\s*=\s*'(clutter[-.][^']+)'/g)) {
      keys.add(match[1]!);
    }
  }
  return [...keys].sort();
}

describe('every storage key is classified', () => {
  it('is either reset by "Reset settings to defaults" or deliberately kept — nothing is unclassified', () => {
    expect(declaredStorageKeys()).toEqual([...RESET_KEYS, ...KEPT_KEYS].sort());
  });

  it('no key is on both sides', () => {
    expect(RESET_KEYS.filter((key) => (KEPT_KEYS as readonly string[]).includes(key))).toEqual([]);
  });
});

describe('resetAppPreferences against that list', () => {
  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = (() => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => localStorage.clear());

  it('removes every reset key, whatever it holds, and keeps every other key', () => {
    for (const key of [...RESET_KEYS, ...KEPT_KEYS]) localStorage.setItem(key, 'custom');

    resetAppPreferences();

    for (const key of RESET_KEYS) expect(localStorage.getItem(key), key).toBeNull();
    for (const key of KEPT_KEYS) expect(localStorage.getItem(key), key).toBe('custom');
  });
});
