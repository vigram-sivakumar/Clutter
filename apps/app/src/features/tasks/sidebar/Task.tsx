import { useState } from 'react';
import { Entry, EntryProps } from '@components/entry/Entry';
import { Checkbox } from '@components/checkbox/Checkbox';
import { OverflowMenu, type OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { renderCompactMarkdown } from '@features/markdown/render/renderCompactMarkdown';
import type { ResolveTag, ResolveWikiLink } from '@features/markdown/editor/MarkdownEditor';
import type { ResolvePageEmbed } from '@features/markdown/render/blocks/pageEmbedResolution';
import './Task.css';

interface TaskProps extends Omit<EntryProps, 'children'> {
  title?: string;
  dueDate?: string;
  isOverdue?: boolean;

  isChecked: boolean;

  onCheckedChange?: (checked: boolean) => void;

  /** Opens the Edit Task modal (NewTaskContent, mode="edit") for this task. Omitted hides the menu item entirely. */
  onEdit?: () => void;
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
  isChecked,
  onCheckedChange,
  onEdit,
  onOpenInNote,
  onDelete,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
  ...entryProps
}: TaskProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const menuItems: OverflowMenuItemConfig[] = [];

  if (onEdit) {
    menuItems.push({ id: 'edit', label: 'Edit', icon: 'edit' });
  }

  if (onOpenInNote) {
    menuItems.push({ id: 'open-in-note', label: 'Open in note', icon: 'note' });
  }

  if (onDelete) {
    // Visually separated as a destructive action — same separatorBefore +
    // trash-icon convention NoteEmbedMoreActions.tsx's own "Remove" item
    // already uses, not a new danger-styling pattern.
    menuItems.push({ id: 'delete', label: 'Delete', icon: 'trash', separatorBefore: true });
  }

  return (
    <Entry
      {...entryProps}
      // Keeps the overflow trigger button visible (Entry's own hover-reveal
      // is pointer-position-based) while this row's menu is open and the
      // pointer may have moved onto the portaled menu — same reasoning
      // Note.tsx/Folder.tsx already apply for their own row-owned menus.
      forceHover={entryProps.forceHover || menuOpen}
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
          onSelect={(id) => {
            if (id === 'edit') {
              onEdit?.();
            } else if (id === 'open-in-note') {
              onOpenInNote?.();
            } else if (id === 'delete') {
              onDelete?.();
            }
          }}
          side="bottom"
          alignment="end"
        />
      }
    >
      <span className={`task-title ${isChecked ? 'is-completed' : ''}`}>
        {renderCompactMarkdown(title ?? '', { resolveWikiLink, resolveTag, resolveEmbed })}
      </span>
    </Entry>
  );
}
