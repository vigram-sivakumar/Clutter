import { ShortcutsDialog } from './ShortcutsDialog';
import { GLOBAL_SHORTCUT_ROW_GROUPS } from './shortcutRows';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** The global keyboard shortcuts reference, opened from the footer's Help menu or ⌥⌘/. */
export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
  return <ShortcutsDialog open={open} onClose={onClose} title="Keyboard shortcuts" groups={GLOBAL_SHORTCUT_ROW_GROUPS} />;
}
