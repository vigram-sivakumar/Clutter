// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SHORTCUT_GROUPS,
  SHORTCUTS,
  characterForCode,
  matchShortcut,
  shortcutKeys,
  type ShortcutBinding,
  type ShortcutId,
} from './shortcuts';

const key = (init: Partial<KeyboardEventInit> & { code: string }): KeyboardEvent => new KeyboardEvent('keydown', init);
const byId = (id: ShortcutId) => SHORTCUTS.find((shortcut) => shortcut.id === id)!;

describe('the shortcut list', () => {
  it('has exactly the agreed groups, items and order', () => {
    expect(SHORTCUT_GROUPS.map((group) => [group.title, group.shortcuts.map((s) => s.label)])).toEqual([
      [
        'Navigation',
        [
          'Go back',
          'Go forward',
          'Open search',
          'Go to Notes',
          'Go to Daily Notes',
          'Go to Tasks',
          'Go to Tags',
          'Go to today’s daily note',
          'Previous daily note',
          'Next daily note',
          'Open Settings',
        ],
      ],
      ['Create', ['New note', 'New folder', 'New task', 'New tag', 'New template']],
      ['Edit', ['Find in note', 'Undo', 'Redo', 'Move to…']],
      [
        'View',
        [
          'Toggle sidebar',
          'Toggle full screen',
          'Toggle cover image',
          'Toggle references',
          'Toggle properties',
          'Zoom in',
          'Zoom out',
          'Actual size',
        ],
      ],
      ['Application', ['Cancel', 'Show keyboard shortcuts', 'Move to trash', 'Quit Clutter']],
    ]);
  });

  it('has unique ids and no two shortcuts on the same key combination', () => {
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
    const combos = SHORTCUTS.flatMap((s) => (s.binding ? [JSON.stringify(s.binding)] : []));
    expect(new Set(combos).size).toBe(combos.length);
  });

  it('never claims a combination macOS or the standard Edit / Window / application menus already use', () => {
    // ⌘Q quit, ⌘W close, ⌘M minimize, ⌘H hide, ⌘C/X/V/Z/A edit, ⌘⇧Z redo, ⌘⇧3/4/5 screenshots, ⌃⌘F full screen
    const reserved: ShortcutBinding[] = [
      ...['KeyQ', 'KeyW', 'KeyM', 'KeyH', 'KeyC', 'KeyX', 'KeyV', 'KeyZ', 'KeyA'].map((code) => ({ code, mod: true as const })),
      { code: 'KeyZ', mod: true, shift: true },
      ...['Digit3', 'Digit4', 'Digit5'].map((code) => ({ code, mod: true as const, shift: true })),
    ];
    const claimed = SHORTCUTS.flatMap((s) => (s.binding ? [JSON.stringify(s.binding)] : []));
    for (const binding of reserved) expect(claimed).not.toContain(JSON.stringify(binding));
  });

  it('gives every shortcut without a binding the chips to show, bar the one listed unassigned on purpose', () => {
    const unassigned = SHORTCUTS.filter((s) => s.binding === null && !s.display?.length).map((s) => s.id);
    expect(unassigned).toEqual(['new-template']);
  });

  it('lists as pending exactly the rows whose action is not wired to a key yet, and a pending row never matches a press', () => {
    expect(SHORTCUTS.filter((s) => s.pending).map((s) => s.id)).toEqual([
      'find-in-note',
      'move-to',
      'toggle-references',
      'toggle-property-list',
      'move-to-trash',
    ]);
    expect(matchShortcut(key({ code: 'KeyF', metaKey: true }), true)).toBeNull();
    expect(matchShortcut(key({ code: 'KeyM', metaKey: true, shiftKey: true }), true)).toBeNull();
    expect(matchShortcut(key({ code: 'Backspace', metaKey: true, shiftKey: true }), true)).toBeNull();
    expect(matchShortcut(key({ code: 'KeyR', metaKey: true, altKey: true }), true)).toBeNull();
  });
});

describe('the chips the dialog shows', () => {
  it('are derived from the binding, in macOS modifier order', () => {
    expect(shortcutKeys(byId('go-back'))).toEqual(['command', 'bracketLeft']);
    expect(shortcutKeys(byId('go-forward'))).toEqual(['command', 'bracketRight']);
    expect(shortcutKeys(byId('open-settings'))).toEqual(['command', 'comma']);
    expect(shortcutKeys(byId('new-folder'))).toEqual(['shift', 'command', { label: 'N' }]);
    expect(shortcutKeys(byId('go-tasks'))).toEqual(['command', { label: '3' }]);
    expect(shortcutKeys(byId('toggle-cover-image'))).toEqual(['control', 'command', { label: 'C' }]);
    expect(shortcutKeys(byId('previous-daily-note'))).toEqual(['control', 'command', 'arrowLeft']);
    expect(shortcutKeys(byId('next-daily-note'))).toEqual(['control', 'command', 'arrowRight']);
    expect(shortcutKeys(byId('new-tag'))).toEqual(['option', 'command', { label: 'T' }]);
    expect(shortcutKeys(byId('move-to'))).toEqual(['shift', 'command', { label: 'M' }]);
    expect(shortcutKeys(byId('new-template'))).toEqual([]);
    expect(shortcutKeys(byId('toggle-sidebar'))).toEqual(['command', { label: '\\' }]);
    expect(shortcutKeys(byId('show-shortcuts'))).toEqual(['option', 'command', { label: '/' }]);
  });

  it('are the stated ones for the native menu items, Esc and the rows not bound yet', () => {
    expect(shortcutKeys(byId('undo'))).toEqual(['command', { label: 'Z' }]);
    expect(shortcutKeys(byId('redo'))).toEqual(['shift', 'command', { label: 'Z' }]);
    expect(shortcutKeys(byId('zoom-in'))).toEqual(['command', { label: '+' }]);
    expect(shortcutKeys(byId('zoom-out'))).toEqual(['command', { label: '-' }]);
    expect(shortcutKeys(byId('actual-size'))).toEqual(['command', { label: '0' }]);
    expect(shortcutKeys(byId('move-to-trash'))).toEqual(['shift', 'command', { label: 'Delete' }]);
    expect(shortcutKeys(byId('cancel'))).toEqual([{ label: 'Esc' }]);
    expect(shortcutKeys(byId('cancel'))).toEqual([{ label: 'Esc' }]);
    expect(shortcutKeys(byId('quit'))).toEqual(['command', { label: 'Q' }]);
    expect(shortcutKeys(byId('toggle-full-screen'))).toEqual(['control', 'command', { label: 'F' }]);
  });
});

describe('matchShortcut', () => {
  it('matches ⌃⌘C to Toggle cover image on a Mac, and exactly', () => {
    expect(matchShortcut(key({ code: 'KeyC', metaKey: true, ctrlKey: true }), true)?.id).toBe('toggle-cover-image');
    // ⌘C is Copy; ⌃C and ⌥⌘C are not ours.
    expect(matchShortcut(key({ code: 'KeyC', metaKey: true }), true)).toBeNull();
    expect(matchShortcut(key({ code: 'KeyC', ctrlKey: true }), true)).toBeNull();
    expect(matchShortcut(key({ code: 'KeyC', metaKey: true, altKey: true }), true)).toBeNull();
    expect(matchShortcut(key({ code: 'KeyC', metaKey: true, ctrlKey: true }), false)).toBeNull();
  });

  it('keeps ⌘\\ for Toggle sidebar, and ⇧⌘\\ is not a shortcut of ours', () => {
    expect(matchShortcut(key({ code: 'Backslash', metaKey: true }), true)?.id).toBe('toggle-sidebar');
    expect(matchShortcut(key({ code: 'Backslash', metaKey: true, shiftKey: true }), true)).toBeNull();
  });

  it('matches ⌘[ and ⌘] to history navigation, by physical key', () => {
    expect(matchShortcut(key({ code: 'BracketLeft', key: '[', metaKey: true }), true)?.id).toBe('go-back');
    expect(matchShortcut(key({ code: 'BracketRight', key: ']', metaKey: true }), true)?.id).toBe('go-forward');
  });

  it('falls back to the character typed when the source reports no physical key', () => {
    expect(matchShortcut(key({ code: '', key: '[', metaKey: true }), true)?.id).toBe('go-back');
    expect(matchShortcut(key({ code: '', key: 'K', metaKey: true }), true)?.id).toBe('open-search');
    expect(matchShortcut(key({ code: '', key: '/', metaKey: true, altKey: true }), true)?.id).toBe('show-shortcuts');
    expect(matchShortcut(key({ code: '', key: 'q', metaKey: true }), true)).toBeNull();
  });

  it('matches ⌃⌘← and ⌃⌘→ on a Mac only, and exactly', () => {
    expect(matchShortcut(key({ code: 'ArrowLeft', metaKey: true, ctrlKey: true }), true)?.id).toBe('previous-daily-note');
    expect(matchShortcut(key({ code: 'ArrowRight', metaKey: true, ctrlKey: true }), true)?.id).toBe('next-daily-note');
    // ⌘← alone is the editor's line-start, ⌃← alone switches Spaces: neither is a shortcut of ours.
    expect(matchShortcut(key({ code: 'ArrowLeft', metaKey: true }), true)).toBeNull();
    expect(matchShortcut(key({ code: 'ArrowLeft', ctrlKey: true }), true)).toBeNull();
    expect(matchShortcut(key({ code: 'ArrowLeft', ctrlKey: true }), false)).toBeNull();
    expect(matchShortcut(key({ code: 'ArrowLeft', metaKey: true, ctrlKey: true }), false)).toBeNull();
  });

  it('uses Ctrl where there is no ⌘', () => {
    expect(matchShortcut(key({ code: 'KeyK', ctrlKey: true }), false)?.id).toBe('open-search');
    expect(matchShortcut(key({ code: 'KeyK', metaKey: true }), false)).toBeNull();
    expect(matchShortcut(key({ code: 'KeyK', ctrlKey: true }), true)).toBeNull();
  });

  it('is exact about the other modifiers', () => {
    expect(matchShortcut(key({ code: 'KeyN', metaKey: true }), true)?.id).toBe('new-note');
    expect(matchShortcut(key({ code: 'KeyN', metaKey: true, shiftKey: true }), true)?.id).toBe('new-folder');
    expect(matchShortcut(key({ code: 'KeyN', metaKey: true, altKey: true }), true)).toBeNull();
    expect(matchShortcut(key({ code: 'KeyN', metaKey: true, ctrlKey: true }), true)).toBeNull();
    expect(matchShortcut(key({ code: 'KeyN' }), true)).toBeNull();
  });

  it('never matches Escape, plain typing, or the editor’s own ⌘Z / ⌘B', () => {
    expect(matchShortcut(key({ code: 'Escape', key: 'Escape' }), true)).toBeNull();
    expect(matchShortcut(key({ code: 'Escape', metaKey: true }), true)).toBeNull();
    expect(matchShortcut(key({ code: 'KeyA', key: 'a' }), true)).toBeNull();
    expect(matchShortcut(key({ code: 'KeyZ', metaKey: true }), true)).toBeNull();
    expect(matchShortcut(key({ code: 'KeyB', metaKey: true }), true)).toBeNull();
  });
});

describe('the native menu bar (src-tauri/src/app_menu.rs)', () => {
  const rust = readFileSync(join(__dirname, '../../../src-tauri/src/app_menu.rs'), 'utf8');
  const accelerator = (binding: ShortcutBinding, key: string): string =>
    ['CmdOrCtrl', binding.alt ? 'Alt' : '', binding.shift ? 'Shift' : '', key].filter(Boolean).join('+');

  it('gives each shortcut the dispatcher leaves to it the same accelerator the dialog shows', () => {
    const expected: Array<[ShortcutId, string]> = [
      ['new-note', 'N'],
      ['new-folder', 'N'],
      ['new-daily-note', 'D'],
      ['go-back', '['],
      ['go-forward', ']'],
      ['open-settings', ','],
    ];
    for (const [id, character] of expected) {
      const shortcut = byId(id);
      expect(shortcut.owner, id).toBe('native');
      expect(rust, id).toContain(`"${accelerator(shortcut.binding!, character)}"`);
    }
  });

  it('is the only owner of a shortcut it owns: every native shortcut is either listed above or a system item', () => {
    // Menu items the system or the View / Edit menus own, with no accelerator of ours to match.
    const system = ['toggle-full-screen', 'quit', 'undo', 'redo', 'zoom-in', 'zoom-out', 'actual-size'];
    const native = SHORTCUTS.filter((s) => s.owner === 'native').map((s) => s.id);
    expect(native.filter((id) => !system.includes(id)).sort()).toEqual(
      ['go-back', 'go-forward', 'new-daily-note', 'new-folder', 'new-note', 'open-settings'].sort()
    );
  });
});

describe('the zoom items in the View menu', () => {
  const rust = readFileSync(join(__dirname, '../../../src-tauri/src/app_menu.rs'), 'utf8');

  it('have the accelerators the dialog lists (⌘+ is typed on the = key)', () => {
    expect(rust).toContain('ZOOM_ACTUAL_SIZE_ITEM_ID, "Actual Size", true, Some("CmdOrCtrl+0")');
    expect(rust).toContain('ZOOM_IN_ITEM_ID, "Zoom In", true, Some("CmdOrCtrl+=")');
    expect(rust).toContain('ZOOM_OUT_ITEM_ID, "Zoom Out", true, Some("CmdOrCtrl+-")');
  });
});

describe('the Markdown editor’s own keymap', () => {
  // The editor installs CodeMirror's default (less ⌘[ and ⌘], editorDefaultKeymap.ts), history and bracket keymaps
  // (createEditorView.ts). A press the
  // editor handles never reaches the page's dispatcher, so a shortcut on the same keys would silently not work with a
  // note focused. (⌥⌘/ stands where ⌘/ — the editor's toggle-comment — could not.)
  const character = characterForCode;
  const normalize = (name: string): string => {
    const parts = name.replace(/-$/, '-minus').split('-');
    const key = (parts.pop() as string).toLowerCase().replace('minus', '-');
    const modifiers = parts.map((m) => m.toLowerCase().replace('cmd', 'mod').replace('meta', 'mod')).sort();
    return [...modifiers, key].join('-');
  };
  const NAMED: Record<string, string> = { ArrowLeft: 'arrowleft', ArrowRight: 'arrowright' };
  const fromBinding = (binding: ShortcutBinding): string =>
    normalize(
      ['Mod', binding.ctrl ? 'Ctrl' : '', binding.alt ? 'Alt' : '', binding.shift ? 'Shift' : '', NAMED[binding.code] ?? character(binding.code)]
        .filter(Boolean)
        .join('-')
    );

  it('claims no key combination the editor handles — ⌘[ and ⌘] included, which the editor leaves to Go back / Go forward', async () => {
    const { historyKeymap } = await import('@codemirror/commands');
    const { closeBracketsKeymap } = await import('@codemirror/autocomplete');
    const { editorDefaultKeymap } = await import('@features/markdown/editor/codemirror/editorDefaultKeymap');
    const editorKeys = new Set(
      [...editorDefaultKeymap, ...historyKeymap, ...closeBracketsKeymap].flatMap((binding) =>
        [binding.key, binding.mac].flatMap((name) => (name ? [normalize(name)] : []))
      )
    );
    const clashes = SHORTCUTS.flatMap((s) => (s.binding && editorKeys.has(fromBinding(s.binding)) ? [s.id] : []));
    expect(clashes).toEqual([]);
  });
});
