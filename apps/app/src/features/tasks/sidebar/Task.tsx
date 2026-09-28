import { Entry, EntryProps } from '@components/entry/Entry';
import { Checkbox } from '@components/checkbox/Checkbox';
import { Button } from '@components/button/Button';
import { OverflowMenu } from '@components/menu/OverflowMenu';
import { useOverlay } from '@components/overlay/hooks/useOverlay';
import { AppIcon } from '@shared/icon';
import { renderCompactMarkdown } from '@features/markdown/render/renderCompactMarkdown';
import type { ResolveTag, ResolveWikiLink } from '@features/markdown/editor/MarkdownEditor';
import type { ResolvePageEmbed } from '@features/markdown/render/blocks/pageEmbedResolution';
import { TaskDatePicker } from './TaskDatePicker';
import './Task.css';

interface TaskProps extends Omit<EntryProps, 'children'> {
  title?: string;
  dueDate?: string;
  isOverdue?: boolean;

  /**
   * The task's raw ISO `YYYY-MM-DD` date, distinct from `dueDate` (a
   * pre-formatted display string, e.g. "20 Aug", and undefined when the
   * date is today — see renderTaskRow) — needed as-is so the calendar
   * picker can pre-select the currently assigned date.
   */
  date?: string;
  /** Fired when a date is chosen from the calendar picker, or `null` when cleared. Omitted hides the calendar action entirely. */
  onDateChange?: (date: string | null) => void;

  isChecked: boolean;

  onCheckedChange?: (checked: boolean) => void;

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
}

export function Task({
  title,
  dueDate,
  isOverdue,
  date,
  onDateChange,
  isChecked,
  onCheckedChange,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
  ...entryProps
}: TaskProps) {
  const datePicker = useOverlay<HTMLButtonElement>();

  return (
    <>
      <Entry
        {...entryProps}
        // Keeps the calendar/overflow trigger buttons visible (Entry's own
        // hover-reveal is pointer-position-based) while this row's date
        // picker is open and the pointer may have moved onto the portaled
        // Calendar — same reasoning Note.tsx/Folder.tsx already apply for
        // their own row-owned overlays.
        forceHover={entryProps.forceHover || datePicker.open}
        leading={
          <Checkbox isChecked={isChecked} onCheckedChange={onCheckedChange} />
        }
        hideTrailingOnHover={false}
        trailing={
          dueDate && (
            <span className={`task__due-date ${isOverdue ? 'is-overdue' : ''}`}>
              {dueDate}
            </span>
          )
        }
        actions={
          <>
            {onDateChange && (
              <Button
                ref={datePicker.anchorRef}
                isIconOnly
                size="small"
                variant="ghost"
                interaction="subtle"
                aria-label="Set date"
                onClick={(event) => {
                  event.stopPropagation();
                  datePicker.toggle();
                }}
              >
                <AppIcon icon="calendar" />
              </Button>
            )}
            <OverflowMenu
              items={[]}
              open={false}
              onOpenChange={() => {}}
              onSelect={() => {}}
              side="bottom"
              alignment="start"
            />
          </>
        }
      >
        <span className={`task-title ${isChecked ? 'is-completed' : ''}`}>
          {renderCompactMarkdown(title ?? '', { resolveWikiLink, resolveTag, resolveEmbed })}
        </span>
      </Entry>

      {onDateChange && (
        <TaskDatePicker
          anchorRef={datePicker.anchorRef}
          open={datePicker.open}
          onClose={datePicker.hide}
          date={date}
          onSelect={(selected) => {
            datePicker.hide();
            onDateChange(selected);
          }}
          onClear={() => {
            datePicker.hide();
            onDateChange(null);
          }}
        />
      )}
    </>
  );
}
