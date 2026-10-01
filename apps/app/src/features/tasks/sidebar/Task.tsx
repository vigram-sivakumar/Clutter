import { useRef, useState } from 'react';
import { Entry, EntryProps } from '@components/entry/Entry';
import { Checkbox } from '@components/checkbox/Checkbox';
import {
  OverflowMenu,
  type OverflowMenuItemConfig,
} from '@components/menu/OverflowMenu';
import { renderCompactMarkdown } from '@features/markdown/render/renderCompactMarkdown';
import { formatTaskDueDate } from '../helpers/formatTaskDueDate';
import type {
  ResolveTag,
  ResolveWikiLink,
} from '@features/markdown/editor/MarkdownEditor';
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
   * date is today — see renderTaskRow) — needed as-is so the Change due
   * date calendar can pre-select the currently assigned date.
   */
  date?: string;

  isChecked: boolean;

  onCheckedChange?: (checked: boolean) => void;

  /** Opens the exact same Calendar used elsewhere (TaskDatePicker), to change only this task's due date. A date string sets it, null clears it. Omitted hides the menu item entirely. */
  onChangeDueDate?: (date: string | null) => void;
  /** Opens the task's source note — same action as clicking the row itself. Omitted hides the menu item entirely. */
  onOpenInNote?: () => void;
  /** Deletes the task's line from its source note. Omitted hides the menu item entirely. */
  onDelete?: () => void;

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
  isChecked,
  onCheckedChange,
  onChangeDueDate,
  onOpenInNote,
  onDelete,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
  ...entryProps
}: TaskProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  // Shared by the OverflowMenu trigger and the Change due date calendar —
  // there's only one visible button on this row to anchor either overlay
  // to, so both anchor to it via OverflowMenu's own triggerRef override
  // rather than this component owning two separate trigger buttons.
  const menuAnchorRef = useRef<HTMLButtonElement>(null);

  const menuItems: OverflowMenuItemConfig[] = [];

  if (onChangeDueDate) {
    menuItems.push({
      id: 'change-due-date',
      label: 'Due date',
      icon: 'calendarDots',
      trailing: date ? formatTaskDueDate(date) : undefined,
    });
  }

  if (onOpenInNote) {
    menuItems.push({ id: 'open-in-note', label: 'Open in note', icon: 'note' });
  }

  if (onDelete) {
    // Visually separated as a destructive action — same separatorBefore +
    // trash-icon convention NoteEmbedMoreActions.tsx's own "Remove" item
    // already uses, not a new danger-styling pattern.
    menuItems.push({
      id: 'delete',
      label: 'Delete',
      icon: 'trash',
      separatorBefore: true,
    });
  }

  return (
    <>
      <Entry
        {...entryProps}
        // Keeps the overflow trigger button visible (Entry's own hover-reveal
        // is pointer-position-based) while this row's menu or date picker is
        // open and the pointer may have moved onto the portaled overlay —
        // same reasoning Note.tsx/Folder.tsx already apply for their own
        // row-owned overlays.
        forceHover={entryProps.forceHover || menuOpen || isDatePickerOpen}
        leading={
          <Checkbox isChecked={isChecked} onCheckedChange={onCheckedChange} />
        }
        trailing={
          dueDate && (
            <span className={`task__due-date ${isOverdue ? 'is-overdue' : ''}`}>
              {dueDate}
            </span>
          )
        }
        actions={
          <OverflowMenu
            items={menuItems}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            triggerRef={menuAnchorRef}
            onSelect={(id) => {
              if (id === 'change-due-date') {
                setIsDatePickerOpen(true);
              } else if (id === 'open-in-note') {
                onOpenInNote?.();
              } else if (id === 'delete') {
                onDelete?.();
              }
            }}
            side="bottom"
            alignment="start"
          />
        }
      >
        <span className={`task-title ${isChecked ? 'is-completed' : ''}`}>
          {renderCompactMarkdown(title ?? '', {
            resolveWikiLink,
            resolveTag,
            resolveEmbed,
          })}
        </span>
      </Entry>

      {onChangeDueDate && (
        <TaskDatePicker
          anchorRef={menuAnchorRef}
          open={isDatePickerOpen}
          onClose={() => setIsDatePickerOpen(false)}
          date={date}
          onSelect={(selected) => {
            setIsDatePickerOpen(false);
            onChangeDueDate(selected);
          }}
          onClear={() => {
            setIsDatePickerOpen(false);
            onChangeDueDate(null);
          }}
        />
      )}
    </>
  );
}
