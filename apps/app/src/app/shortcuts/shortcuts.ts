import type { SystemIcon } from '@shared/icon';

/**
 * Clutter's global keyboard shortcuts: the one list the dispatcher (ShortcutsProvider) matches key presses against
 * and the Keyboard shortcuts dialog draws from. The dialog's key chips are derived from each binding, so what the
 * dialog shows cannot drift from what the dispatcher matches. Markdown editing shortcuts are not here: the editor
 * owns them.
 */

export type ShortcutId =
  | 'go-back'
  | 'go-forward'
  | 'open-search'
  | 'open-settings'
  | 'go-notes'
  | 'go-daily-notes'
  | 'go-tasks'
  | 'go-tags'
  | 'previous-daily-note'
  | 'next-daily-note'
  | 'new-note'
  | 'new-folder'
  | 'new-task'
  | 'new-daily-note'
  | 'new-tag'
  | 'new-template'
  | 'find-in-note'
  | 'undo'
  | 'redo'
  | 'move-to'
  | 'move-to-trash'
  | 'toggle-cover-image'
  | 'toggle-references'
  | 'toggle-property-list'
  | 'zoom-in'
  | 'zoom-out'
  | 'actual-size'
  | 'toggle-sidebar'
  | 'toggle-full-screen'
  | 'cancel'
  | 'show-shortcuts'
  | 'quit';

/**
 * A key press, by physical key (`KeyboardEvent.code`) so it does not depend on the keyboard layout. `mod` is ⌘ on
 * macOS and Ctrl elsewhere; no other modifier may be held.
 */
export interface ShortcutBinding {
  readonly code: string;
  readonly mod: true;
  readonly shift?: boolean;
  readonly alt?: boolean;
  /** ⌃ together with ⌘. macOS only: elsewhere Ctrl is `mod` itself, so such a binding never matches. */
  readonly ctrl?: boolean;
}

/** One key chip in the dialog: an icon from the registry, or a text label for a key that has no icon. */
export type ShortcutKeySpec = SystemIcon | { readonly label: string };

export interface ShortcutDefinition {
  readonly id: ShortcutId;
  readonly label: string;
  /** What the dispatcher matches. Null: nothing for it to match (see `display`). */
  readonly binding: ShortcutBinding | null;
  /**
   * Who handles the key press on the desktop app. `native`: the macOS menu bar owns it (src-tauri/src/app_menu.rs
   * gives the menu item this accelerator, or it is a system item), and the dispatcher skips it there so it is never
   * handled twice. `app`: the dispatcher handles it. In the browser build there is no menu bar, so the dispatcher
   * handles every shortcut that has a binding.
   */
  readonly owner: 'native' | 'app';
  /** The chips to show when there is no binding to derive them from (Esc, a native menu item's, an unbound row's). */
  readonly display?: readonly ShortcutKeySpec[];
  /**
   * Listed in the dialog, but the action it names is not wired to this key yet (no feature to run, or the key
   * collides with the editor's own and has to be settled first). A pending row never matches a key press.
   */
  readonly pending?: true;
}

export interface ShortcutGroup {
  readonly title: string;
  readonly shortcuts: readonly ShortcutDefinition[];
}

const mod = (code: string, extra: { shift?: boolean; alt?: boolean; ctrl?: boolean } = {}): ShortcutBinding => ({
  code,
  mod: true,
  ...extra,
});

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { id: 'go-back', label: 'Go back', binding: mod('BracketLeft'), owner: 'native' },
      { id: 'go-forward', label: 'Go forward', binding: mod('BracketRight'), owner: 'native' },
      { id: 'open-search', label: 'Open search', binding: mod('KeyK'), owner: 'app' },
      { id: 'go-notes', label: 'Go to Notes', binding: mod('Digit1'), owner: 'app' },
      { id: 'go-daily-notes', label: 'Go to Daily Notes', binding: mod('Digit2'), owner: 'app' },
      { id: 'go-tasks', label: 'Go to Tasks', binding: mod('Digit3'), owner: 'app' },
      { id: 'go-tags', label: 'Go to Tags', binding: mod('Digit4'), owner: 'app' },
      // Opens today's note, creating it if it does not exist yet: navigation, not creation.
      { id: 'new-daily-note', label: 'Go to today’s daily note', binding: mod('KeyD', { shift: true }), owner: 'native' },
      { id: 'previous-daily-note', label: 'Previous daily note', binding: mod('ArrowLeft', { ctrl: true }), owner: 'app' },
      { id: 'next-daily-note', label: 'Next daily note', binding: mod('ArrowRight', { ctrl: true }), owner: 'app' },
      { id: 'open-settings', label: 'Open Settings', binding: mod('Comma'), owner: 'native' },
    ],
  },
  {
    title: 'Create',
    shortcuts: [
      { id: 'new-note', label: 'New note', binding: mod('KeyN'), owner: 'native' },
      { id: 'new-folder', label: 'New folder', binding: mod('KeyN', { shift: true }), owner: 'native' },
      { id: 'new-task', label: 'New task', binding: mod('KeyT', { shift: true }), owner: 'app' },
      { id: 'new-tag', label: 'New tag', binding: mod('KeyT', { alt: true }), owner: 'app' },
      // No key: the action exists (the Create menu's Template), the row is listed unassigned.
      { id: 'new-template', label: 'New template', binding: null, owner: 'app' },
    ],
  },
  {
    title: 'Edit',
    shortcuts: [
      { id: 'find-in-note', label: 'Find in note', binding: mod('KeyF'), owner: 'app', pending: true },
      // Undo and Redo belong to the editor's own history keymap and the native Edit menu, not to the dispatcher.
      { id: 'undo', label: 'Undo', binding: null, owner: 'native', display: ['command', { label: 'Z' }] },
      { id: 'redo', label: 'Redo', binding: null, owner: 'native', display: ['shift', 'command', { label: 'Z' }] },
      { id: 'move-to', label: 'Move to…', binding: mod('KeyM', { shift: true }), owner: 'app', pending: true },
    ],
  },
  {
    title: 'View',
    shortcuts: [
      { id: 'toggle-sidebar', label: 'Toggle sidebar', binding: mod('Backslash'), owner: 'app' },
      // The system's own View menu item (⌃⌘F): not ours to bind or to match.
      {
        id: 'toggle-full-screen',
        label: 'Toggle full screen',
        binding: null,
        owner: 'native',
        display: ['control', 'command', { label: 'F' }],
      },
      // Page.tsx runs the cover's own hide / show handlers. ⌃⌘C: C for cover, and free in the editor's keymap, in the
      // system and in the browsers (⇧⌘\\ is CodeMirror's jump-to-matching-bracket, ⌥⌘C opens the web inspector).
      { id: 'toggle-cover-image', label: 'Toggle cover image', binding: mod('KeyC', { ctrl: true }), owner: 'app' },
      { id: 'toggle-references', label: 'Toggle references', binding: mod('KeyR', { alt: true }), owner: 'app', pending: true },
      { id: 'toggle-property-list', label: 'Toggle properties', binding: mod('KeyP', { alt: true }), owner: 'app', pending: true },
      // The View menu's own items (app_menu.rs, `add_zoom_items`): the menu bar owns the keys.
      { id: 'zoom-in', label: 'Zoom in', binding: null, owner: 'native', display: ['command', { label: '+' }] },
      { id: 'zoom-out', label: 'Zoom out', binding: null, owner: 'native', display: ['command', { label: '-' }] },
      { id: 'actual-size', label: 'Actual size', binding: null, owner: 'native', display: ['command', { label: '0' }] },
    ],
  },
  {
    title: 'Application',
    shortcuts: [
      // Each open dialog, popover and menu dismisses itself on Escape (components/overlay/hooks/useEscape.ts); this
      // row documents that, and the dispatcher never touches Escape.
      { id: 'cancel', label: 'Cancel', binding: null, owner: 'app', display: [{ label: 'Esc' }] },
      // Not ⌘/: the Markdown editor's default keymap binds it to toggle a comment, so it would never reach the page
      // while a note is focused.
      { id: 'show-shortcuts', label: 'Show keyboard shortcuts', binding: mod('Slash', { alt: true }), owner: 'app' },
      // ⇧⌘Delete (⌘Delete alone is the editor's delete-to-line-start). Not wired to the action yet.
      { id: 'move-to-trash', label: 'Move to trash', binding: mod('Backspace', { shift: true }), owner: 'app', pending: true },
      // The system's own application-menu item (⌘Q).
      { id: 'quit', label: 'Quit Clutter', binding: null, owner: 'native', display: ['command', { label: 'Q' }] },
    ],
  },
];

export const SHORTCUTS: readonly ShortcutDefinition[] = SHORTCUT_GROUPS.flatMap((group) => group.shortcuts);

/** Keys with an icon (or a label that is not the key's own letter), by `KeyboardEvent.code`. */
const KEY_DISPLAY: Record<string, ShortcutKeySpec> = {
  BracketLeft: 'bracketLeft',
  BracketRight: 'bracketRight',
  Comma: 'comma',
  Backslash: { label: '\\' },
  Slash: { label: '/' },
  Backspace: { label: 'Delete' },
  ArrowLeft: 'arrowLeft',
  ArrowRight: 'arrowRight',
};

function displayForCode(code: string): ShortcutKeySpec {
  const known = KEY_DISPLAY[code];
  if (known) return known;
  if (code.startsWith('Key')) return { label: code.slice(3) };
  if (code.startsWith('Digit')) return { label: code.slice(5) };
  return { label: code };
}

/** The chips for a shortcut, in the macOS order: control, option, shift, command, then the key. */
export function shortcutKeys(shortcut: ShortcutDefinition): readonly ShortcutKeySpec[] {
  const { binding } = shortcut;
  if (!binding) return shortcut.display ?? [];
  return [
    ...(binding.ctrl ? (['control'] as const) : []),
    ...(binding.alt ? (['option'] as const) : []),
    ...(binding.shift ? (['shift'] as const) : []),
    'command',
    displayForCode(binding.code),
  ];
}

export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
}

const CHARACTER_FOR_CODE: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Backslash: '\\',
  Slash: '/',
  Backspace: 'backspace',
};

/** The character a physical key types with no modifier (`KeyboardEvent.key`, lower-cased), for a `code`. */
export function characterForCode(code: string): string {
  return CHARACTER_FOR_CODE[code] ?? code.replace(/^(Key|Digit)/, '').toLowerCase();
}

/**
 * Whether the press is the binding's key. By physical key when the event reports one; some sources (a remote or
 * virtual keyboard, some automation) report no `code`, and then by the character typed.
 */
function isKey(event: KeyboardEvent, binding: ShortcutBinding): boolean {
  if (event.code) return event.code === binding.code;
  return event.key.toLowerCase() === characterForCode(binding.code);
}

/** The shortcut a key press is, or null. Exact: a held modifier the binding does not name means no match. */
export function matchShortcut(event: KeyboardEvent, mac: boolean = isMacPlatform()): ShortcutDefinition | null {
  if (!(mac ? event.metaKey : event.ctrlKey)) return null;
  // Besides ⌘ (or Ctrl, off the Mac), the other of the two may be held only as a binding's own ⌃ (Mac only).
  const otherHeld = mac ? event.ctrlKey : event.metaKey;
  return (
    SHORTCUTS.find(
      ({ binding, pending }) =>
        binding !== null &&
        !pending &&
        isKey(event, binding) &&
        (binding.shift ?? false) === event.shiftKey &&
        (binding.alt ?? false) === event.altKey &&
        (mac ? (binding.ctrl ?? false) === otherHeld : !binding.ctrl && !otherHeld)
    ) ?? null
  );
}
