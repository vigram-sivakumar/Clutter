import { useEffect, useReducer, useRef, useState } from 'react';
import { Button } from '@components/button/Button';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { Overlay } from '@components/overlay/Overlay';
import { getPageIcon } from '@core/presentation/getPageIcon';
import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';
import { AppIcon } from '@shared/icon';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

/** A folder a new note can be created in. */
export interface NoteLocationOption {
  readonly id: string;
  /** The folder's own name — what a row leads with. */
  readonly title: string;
  /** Its ancestors' names, outermost first, joined by " / "; empty for a top-level folder. */
  readonly parentPath: string;
  readonly emoji?: string | null;
}

/** What the setting needs from the open Space; supplied by whoever renders Settings (the sidebar). */
export interface NoteLocationSource {
  /** Every folder a note may be created in, in the sidebar's order, parents before their children. Not Inbox. */
  getFolders(): readonly NoteLocationOption[];
  /** The chosen folder's id, or undefined for Inbox, the default. Already checked to still be a valid destination. */
  getSelectedId(): string | undefined;
  /** Chooses a folder, or Inbox with undefined. */
  select(folderId: string | undefined): void;
  /** Called when the folders or the choice change, so the menu and the button label stay current. */
  subscribe(listener: () => void): () => void;
}

interface DefaultNoteLocationSettingProps {
  source?: NoteLocationSource;
}

const INBOX_LABEL = 'Inbox';

export function DefaultNoteLocationSetting({ source }: DefaultNoteLocationSettingProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [, refresh] = useReducer((count: number) => count + 1, 0);
  useEffect(() => source?.subscribe(refresh), [source]);

  const folders = source?.getFolders() ?? [];
  const selectedId = source?.getSelectedId();
  const selected = folders.find((folder) => folder.id === selectedId);
  // A saved folder that is no longer offered reads as Inbox, which is where a note would go.
  const label = selected?.title ?? INBOX_LABEL;
  const inboxIcon = getSystemLocationPresentation('inbox').icon;
  // A row is the folder's own name; only folders that share a name with another also say where they are, after
  // the name, so a long path can never push the name out of the row.
  const sharedTitles = new Set(
    folders.filter((folder, index) => folders.some((other, i) => i !== index && other.title === folder.title)).map((folder) => folder.title)
  );
  const fullPath = (folder: NoteLocationOption) =>
    folder.parentPath ? `${folder.parentPath} / ${folder.title}` : folder.title;

  return (
    <SettingsEntry
      title="Default note location"
      description="Choose where new notes are created by default"
      trailing={
        <>
          <Button
            ref={triggerRef}
            variant="outline"
            isActive={menuOpen}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Default note location: ${selected ? fullPath(selected) : INBOX_LABEL}`}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {label}
          </Button>
          <Overlay
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            anchorRef={triggerRef}
            side="bottom"
            alignment="end"
          >
            <Menu size="medium">
              <MenuItem
                aria-current={selected === undefined || undefined}
                leading={<AppIcon icon={inboxIcon} />}
                trailing={selected === undefined ? <AppIcon icon="tick" /> : undefined}
                onClick={() => {
                  source?.select(undefined);
                  setMenuOpen(false);
                }}
              >
                {INBOX_LABEL}
              </MenuItem>
              {folders.map((folder) => (
                <MenuItem
                  key={folder.id}
                  aria-current={folder.id === selected?.id || undefined}
                  leading={<AppIcon icon={getPageIcon('folder')} emoji={folder.emoji} />}
                  trailing={folder.id === selected?.id ? <AppIcon icon="tick" /> : undefined}
                  onClick={() => {
                    source?.select(folder.id);
                    setMenuOpen(false);
                  }}
                >
                  <span className="truncate" title={fullPath(folder)}>
                    {sharedTitles.has(folder.title) && folder.parentPath
                      ? `${folder.title} · ${folder.parentPath}`
                      : folder.title}
                  </span>
                </MenuItem>
              ))}
            </Menu>
          </Overlay>
        </>
      }
    />
  );
}
