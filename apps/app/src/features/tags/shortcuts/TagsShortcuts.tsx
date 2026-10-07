import { useRef, useState } from 'react';
import { AppIcon } from '@shared/icon';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
import { Dialog } from '@components/dialog/Dialog';
import { Confirmation } from '@components/confirmation/Confirmation';
import { Overlay } from '@components/overlay/Overlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { MenuGroupTitle } from '@components/menu/MenuGroupTitle';
import { useConfirmationSurface } from '@components/confirmation/useConfirmationSurface';
import type { TagStyle } from '@core/vault/models/Tag';

import { tagsShortcuts, type TagsShortcutId } from './tagsShortcuts.config';

interface TagsShortcutsProps {
  onShortcut: (id: TagsShortcutId) => void;
  /**
   * Asks the sidebar to open the New tag dialog. The dialog is hosted by
   * Sidebar (not here) so the sidebar top controls' New tag can open the
   * same one without this panel being mounted.
   */
  onRequestNewTag: () => void;
  /** How many tags no note uses — Tidy up is disabled at 0. */
  unusedTagCount: number;
  /** Removes every unused tag's definition (notes untouched); resolves once durable. */
  onTidyUp: () => Promise<void>;
  /** Re-cases every existing tag in `style`, once — not a setting; resolves when done. */
  onRestyle: (style: TagStyle) => Promise<void>;
}

// The three casings Tidy up offers, in menu order. Labels are the styles'
// own names (they double as the example of what they do).
const TAG_STYLE_OPTIONS: readonly { style: TagStyle; label: string }[] = [
  { style: 'lowercase', label: 'lowercase' },
  { style: 'sentence', label: 'Sentence case' },
  { style: 'title', label: 'Title Case' },
];

export function TagsShortcuts({
  onShortcut,
  onRequestNewTag,
  unusedTagCount,
  onTidyUp,
  onRestyle,
}: TagsShortcutsProps) {
  // 'create-tag' and 'tidy-up' never dispatch through onShortcut/
  // NavigationRouter — they are handled locally, the same shape
  // TasksShortcuts uses for 'create-task' (see tagsShortcuts.config.ts).
  const confirmation = useConfirmationSurface();
  // Tidy up's one-time "restyle existing tags" menu. Choosing a style only
  // asks for confirmation — nothing is scanned until the user confirms, and
  // then TagOperations.restyle() does its one scan.
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);
  const tidyUpRef = useRef<HTMLDivElement>(null);

  const requestRestyle = (style: TagStyle, label: string) => {
    confirmation.request({
      title: `Restyle tags to ${label}?`,
      message: 'This will update all existing tags to this style.',
      confirmLabel: 'Restyle',
      confirmVariant: 'primary',
      onConfirm: () => {
        void onRestyle(style).catch((error: unknown) => {
          console.warn('Restyle tags failed', error);
        });
      },
    });
  };

  const requestTidyUp = () => {
    // Re-checked at click time: an empty confirmation is never opened.
    if (unusedTagCount === 0) {
      return;
    }

    confirmation.request({
      title: 'Tidy up unused tags',
      message: `This will permanently remove ${unusedTagCount} unused ${
        unusedTagCount === 1 ? 'tag' : 'tags'
      }.`,
      confirmLabel: 'Remove',
      onConfirm: () => {
        void onTidyUp().catch((error: unknown) => {
          console.warn('Tidy up failed', error);
        });
      },
    });
  };

  const onClickShortcut = (id: TagsShortcutId) => {
    if (id === 'create-tag') {
      onRequestNewTag();
    } else if (id === 'tidy-up') {
      setIsStyleMenuOpen((open) => !open);
    } else {
      onShortcut(id);
    }
  };

  return (
    <Section>
      {tagsShortcuts.map((shortcut) => (
        <Navigation
          key={shortcut.id}
          title={shortcut.title}
          leading={<AppIcon icon={shortcut.icon} />}
          disabled={shortcut.disabled}
          // Same open-menu state as a row's three-dot menu (Note/Folder/Task): the hover look, not `selected`.
          forceHover={shortcut.id === 'tidy-up' && isStyleMenuOpen}
          onClick={() => onClickShortcut(shortcut.id)}
          {...(shortcut.id === 'tidy-up'
            ? { ref: tidyUpRef, 'aria-haspopup': 'menu' as const, 'aria-expanded': isStyleMenuOpen }
            : {})}
        />
      ))}

      <Overlay
        open={isStyleMenuOpen}
        onClose={() => setIsStyleMenuOpen(false)}
        anchorRef={tidyUpRef}
        side="right"
        alignment="start"
      >
        <Menu size="medium">
          <MenuItem
            leading={<AppIcon icon="dismiss" />}
            disabled={unusedTagCount === 0}
            onClick={(event) => {
              event.stopPropagation();
              setIsStyleMenuOpen(false);
              requestTidyUp();
            }}
          >
            Remove unused
          </MenuItem>
          <div className="menu__divider" role="separator" />
          <MenuGroupTitle>Style</MenuGroupTitle>
          {TAG_STYLE_OPTIONS.map(({ style, label }) => (
            <MenuItem
              key={style}
              onClick={(event) => {
                event.stopPropagation();
                setIsStyleMenuOpen(false);
                requestRestyle(style, label);
              }}
            >
              {label}
            </MenuItem>
          ))}
        </Menu>
      </Overlay>

      <Dialog open={confirmation.pending !== null} onClose={confirmation.cancel} size="medium">
        {confirmation.pending && (
          <Confirmation
            title={confirmation.pending.title}
            description={confirmation.pending.message}
            confirmLabel={confirmation.pending.confirmLabel}
            confirmVariant={confirmation.pending.confirmVariant}
            onConfirm={confirmation.confirm}
            onCancel={confirmation.cancel}
          />
        )}
      </Dialog>
    </Section>
  );
}
