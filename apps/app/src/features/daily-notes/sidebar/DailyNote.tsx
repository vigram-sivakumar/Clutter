import { DateLabel } from '@components/date-label/DateLabel';
import { Entry, type EntryProps } from '@components/entry/Entry';
import { OverflowMenu } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { ChangeIconPicker } from '@components/change-icon-picker/ChangeIconPicker';
import { useChangeIconTrigger } from '@components/change-icon-picker/useChangeIconTrigger';
import { AppIcon } from '@shared/icon';
import { formatDate } from '@shared/helpers/time';
import { renderCompactMarkdown } from '@features/markdown/render/renderCompactMarkdown';
import type { ResolveTag, ResolveWikiLink } from '@features/markdown/editor/MarkdownEditor';
import type { ResolvePageEmbed } from '@features/markdown/render/blocks/pageEmbedResolution';
import './DailyNote.css';

interface DailyNoteProps extends Omit<EntryProps, 'children'> {
  title?: string;
  isToday?: boolean;
  date?: string;
  titleStyle?: 'default' | 'placeholder';

  /**
   * Injected exactly like the page editor's own WikiLink/Tag/embed
   * resolution (see MarkdownEditor's props of the same name, and Note's
   * identical prop doc comment) — omitted falls back to
   * renderCompactMarkdown's own unresolved/raw-text fallback, never a
   * second resolution implementation.
   */
  resolveWikiLink?: ResolveWikiLink;
  resolveTag?: ResolveTag;
  resolveEmbed?: ResolvePageEmbed;

  menuItems?: readonly OverflowMenuItemConfig[];
  menuOpen?: boolean;
  onMenuOpenChange?(open: boolean): void;
  onMenuSelect?(id: string): void;

  /**
   * The note's emoji (frontmatter `icon`), shown in the row's trailing slot — Entry's existing
   * hide-trailing-on-hover swaps it for the actions on hover. A Note shows its emoji in place of
   * its leading icon; a Daily Note's leading slot is its date, so the emoji goes trailing.
   */
  emoji?: string | null;
  /** Present when `menuItems` includes a `change-icon` item — same contract as Note's. */
  onChangeIcon?: (emoji: string | null) => void;
}

export function DailyNote({
  title,
  isToday,
  date,
  titleStyle = 'default',
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
  menuItems,
  menuOpen = false,
  onMenuOpenChange,
  onMenuSelect,
  emoji,
  onChangeIcon,
  ...entryProps
}: DailyNoteProps) {
  const day = date ? Number(formatDate(date, 'date')) : undefined;
  const changeIconTrigger = useChangeIconTrigger(onChangeIcon !== undefined);

  return (
    <>
      <Entry
        {...entryProps}
        // Forces every hover-driven affordance (background, revealed
        // actions) to stay visible while this row's menu is open — the
        // trigger button that controls the menu lives in .entry__actions,
        // which is itself hover-gated, so without this, moving the mouse
        // away mid-menu would hide the button needed to close it. Also
        // forced while the Change icon picker is open.
        forceHover={menuOpen || changeIconTrigger.open}
        leading={<DateLabel isToday={isToday} date={day} />}
        trailing={emoji ? <AppIcon emoji={emoji} /> : undefined}
        actions={
          <OverflowMenu
            buttonSize="xs"
            items={menuItems ?? []}
            triggerRef={changeIconTrigger.triggerRef}
            open={menuOpen}
            onOpenChange={onMenuOpenChange ?? (() => {})}
            onSelect={(id) =>
              changeIconTrigger.handleSelect(id, onMenuSelect ?? (() => {}))
            }
            side="bottom"
            alignment="start"
          />
        }
      >
        <span
          className={
            titleStyle === 'placeholder'
              ? 'daily-note__title daily-note__title--placeholder truncate'
              : 'daily-note__title truncate'
          }
        >
          {renderCompactMarkdown(title ?? '', { resolveWikiLink, resolveTag, resolveEmbed })}
        </span>
      </Entry>
      {onChangeIcon !== undefined && (
        <ChangeIconPicker
          anchorRef={changeIconTrigger.triggerRef}
          open={changeIconTrigger.open}
          onClose={changeIconTrigger.close}
          hasIcon={emoji != null && emoji !== ''}
          onSelect={onChangeIcon}
          onRemove={() => onChangeIcon(null)}
          side="bottom"
          alignment="start"
        />
      )}
    </>
  );
}
