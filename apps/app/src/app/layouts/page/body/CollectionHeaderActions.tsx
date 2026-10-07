import { useRef, useState } from 'react';
import { Button } from '@components/button/Button';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { Overlay } from '@components/overlay/Overlay';
import { AppIcon, type SystemIcon } from '@shared/icon';

import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { Popover } from '@components/popover/Popover';
import { PickerCard } from '@components/picker-card/PickerCard';
import type { PickerListItem } from '@components/picker-list/PickerList.types';

import {
  CollectionViewMenu,
  type CollectionViewMenuProps,
} from './CollectionViewMenu';

const NEW_TEMPLATE_ID = '__new-template__';

/** The template picker's rows: a leading "New template" row, then every template as a flat note row. */
function templateItems(
  templates: readonly CollectionEntryModel[]
): PickerListItem[] {
  return [
    {
      id: NEW_TEMPLATE_ID,
      title: 'New template',
      icon: 'plus',
      level: 0,
      parentId: null,
    },
    ...templates.map((template) => ({
      id: template.id,
      title: template.values.name,
      emoji: template.emoji,
      level: 0,
      parentId: null,
    })),
  ];
}

/**
 * What each kind of collection's Add menu calls its entries — one convention: creation reads
 * "New …" (a note, a template, a folder). Assets' first entry is "Upload": it imports files, it does
 * not make a blank one.
 */
export const NOTE_MENU_LABELS = { create: 'New note', createFolder: 'New folder' } as const;
export const TEMPLATE_MENU_LABELS = {
  create: 'New template',
  createFolder: 'New folder',
  createIcon: 'template',
} as const;
export const ASSET_MENU_LABELS = {
  create: 'Upload',
  createFolder: 'New folder',
  createIcon: 'upload',
} as const;

export interface CollectionHeaderActionsProps {
  /** The standard Configure control (Layout / Properties / Sort) — Settings and the view-mode control. */
  menu: CollectionViewMenuProps;
  /** The standard Add action. Absent -> no Add button (e.g. a collection that can't create items here). */
  onAdd?: () => void;
  /**
   * Create a folder here. Adds New folder to the Add menu; the button is a menu whenever it has
   * New folder or From template to offer, and stays the single-action button otherwise.
   */
  onAddFolder?: () => void;
  /**
   * Offer From template in the Add menu — one item that swaps the menu for a searchable template list, anchored to the same button;
   * absent -> the menu has just New note / New folder.
   */
  fromTemplate?: {
    /** The templates to show, read when the menu opens; each entry's `onClick` creates a note from it. */
    getTemplates: () => CollectionEntryModel[];
    /** The list's leading "New template" row. */
    onCreateTemplate: () => void;
  };
  /**
   * What the Add menu's entries are called, and the first one's icon — the page's own wording ("New
   * note" and "New folder" for notes, "New template" for Templates, "Upload" and "New folder" for assets). Absent: the notes' words.
   */
  menuLabels?: { readonly create: string; readonly createFolder: string; readonly createIcon?: SystemIcon };
  /** Accessible label of the Add button — "New" for notes, "Upload" for assets. */
  addLabel?: string;
  /** Icon of the Add button — the page passes it; absent, a plus. */
  addIcon?: SystemIcon;
}

/**
 * The one collection header-actions block: the Configure (Settings / view
 * mode) control followed by the primary Add button. Every collection type —
 * folders, Workspace/Favorites/Tags, Assets — renders this same component into
 * the page's `titleActions` slot, so the controls, their order and their look
 * are defined exactly once. A collection customizes what the controls *do*
 * (`menu.capabilities`, `onAdd`, `addLabel`), never which controls exist.
 */
export function CollectionHeaderActions({
  menu,
  onAdd,
  onAddFolder,
  fromTemplate,
  menuLabels = NOTE_MENU_LABELS,
  addLabel = 'New',
  addIcon = 'plus',
}: CollectionHeaderActionsProps) {
  const [open, setOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  // The From template item hands focus to the template list's search field, not back to the Add button.
  const suppressReturnFocusRef = useRef(false);
  // The Add button is a menu as soon as there is more than one way to add: New folder, or From template.
  const hasAddMenu = Boolean(onAdd && (onAddFolder || fromTemplate));
  // Read when the picker opens, so it lists the templates as they are now.
  const templates =
    templatesOpen && fromTemplate ? fromTemplate.getTemplates() : [];

  return (
    <>
      <CollectionViewMenu {...menu} />
      {onAdd && (
        <Button
          ref={anchorRef}
          isIconOnly
          variant="primary"
          aria-label={addLabel}
          aria-haspopup={hasAddMenu ? 'menu' : undefined}
          aria-expanded={hasAddMenu ? open : undefined}
          onClick={hasAddMenu ? () => setOpen((value) => !value) : onAdd}
        >
          <AppIcon icon={addIcon} />
        </Button>
      )}
      {hasAddMenu && (
        <Overlay
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
          side="bottom"
          alignment="end"
          suppressReturnFocusRef={suppressReturnFocusRef}
        >
          <Menu size="medium">
            <MenuItem
              leading={<AppIcon icon={menuLabels.createIcon ?? 'note'} />}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onAdd?.();
              }}
            >
              {menuLabels.create}
            </MenuItem>
            {onAddFolder && (
              <MenuItem
                leading={<AppIcon icon="folder" />}
                onClick={(event) => {
                  event.stopPropagation();
                  // The new folder's name field takes focus; the menu must not hand it back to the button.
                  suppressReturnFocusRef.current = true;
                  setOpen(false);
                  onAddFolder();
                }}
              >
                {menuLabels.createFolder}
              </MenuItem>
            )}
            {fromTemplate && (
              <>
                <div className="menu__divider" role="separator" />
                <MenuItem
                  leading={<AppIcon icon="template" />}
                  onClick={(event) => {
                    event.stopPropagation();
                    suppressReturnFocusRef.current = true;
                    setOpen(false);
                    setTemplatesOpen(true);
                  }}
                >
                  From template
                </MenuItem>
              </>
            )}
          </Menu>
        </Overlay>
      )}
      {fromTemplate && (
        <Popover
          anchorRef={anchorRef}
          open={templatesOpen}
          onClose={() => setTemplatesOpen(false)}
          returnFocusRef={anchorRef}
          side="bottom"
          alignment="end"
        >
          <PickerCard
            title="Templates"
            // Dismiss (×) goes back to the Add menu it replaced; Escape / an outside click just close.
            onClose={() => {
              setTemplatesOpen(false);
              setOpen(true);
            }}
            items={templatesOpen ? templateItems(templates) : []}
            placeholder="Search templates"
            leadingIcon="template"
            onSelect={(item) => {
              setTemplatesOpen(false);
              if (item.id === NEW_TEMPLATE_ID) {
                fromTemplate.onCreateTemplate();
              } else {
                templates
                  .find((template) => template.id === item.id)
                  ?.onClick();
              }
            }}
          />
        </Popover>
      )}
    </>
  );
}
