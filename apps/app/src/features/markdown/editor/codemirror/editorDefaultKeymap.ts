import { defaultKeymap } from '@codemirror/commands';

/**
 * CodeMirror's default keymap, minus the two bindings the application owns.
 *
 * `@codemirror/commands` binds `Mod-[` to `indentLess` and `Mod-]` to `indentMore`. In Clutter those keys are
 * history navigation — Go back and Go forward (app/shortcuts/shortcuts.ts; on the desktop the native Go menu
 * owns them, see src-tauri/src/app_menu.rs) — and indentation is `Tab` / `Shift-Tab` (indent/markdownIndentKeymap.ts).
 *
 * The bindings are removed rather than overridden with a command that does nothing. CodeMirror calls `preventDefault`
 * on a key press it handles, and the application's shortcut dispatcher stands down for a press that is already
 * prevented (app/shortcuts/ShortcutsProvider.tsx), so a handler here, even a no-op one, would stop Go back working
 * with a note focused. With the bindings gone the press passes through the editor untouched and the application
 * layer handles it. Everything else in the default keymap, including `Mod-Alt-\` (`indentSelection`), is kept.
 */
const APPLICATION_OWNED_KEYS: ReadonlySet<string> = new Set(['Mod-[', 'Mod-]']);

export const editorDefaultKeymap = defaultKeymap.filter(
  (binding) => !(binding.key && APPLICATION_OWNED_KEYS.has(binding.key) && !binding.mac && !binding.win && !binding.linux)
);
