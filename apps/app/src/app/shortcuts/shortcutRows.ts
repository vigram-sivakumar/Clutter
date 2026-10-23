import { SHORTCUT_GROUPS, shortcutKeys, type ShortcutKeySpec } from './shortcuts';

/**
 * One row of a shortcuts dialog: a label, optional supporting text, and what to press (`keys`, drawn as key chips)
 * or what to type (`trigger`, drawn as plain monospace text: Markdown syntax that starts a feature is not a key
 * combination). Both shortcuts dialogs are drawn from groups of these, by the one `ShortcutsDialog`.
 */
export interface ShortcutRow {
  readonly id: string;
  readonly label: string;
  /** Supporting text under the label: the context the row applies in. */
  readonly description?: string;
  readonly keys?: readonly ShortcutKeySpec[];
  readonly trigger?: string;
}

export interface ShortcutRowGroup {
  readonly title: string;
  readonly rows: readonly ShortcutRow[];
}

/** The global list (shortcuts.ts), as rows: the chips come from each binding, so they cannot drift from it. */
export const GLOBAL_SHORTCUT_ROW_GROUPS: readonly ShortcutRowGroup[] = SHORTCUT_GROUPS.map((group) => ({
  title: group.title,
  rows: group.shortcuts.map((shortcut) => ({
    id: shortcut.id,
    label: shortcut.label,
    keys: shortcutKeys(shortcut),
  })),
}));
