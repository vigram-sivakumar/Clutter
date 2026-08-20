import { Entry, EntryProps } from '@components/entry/Entry';
import { Checkbox } from '@components/checkbox/Checkbox';
import { OverflowMenu } from '@components/menu/OverflowMenu';
import { renderCompactMarkdown } from '@features/markdown/render/renderCompactMarkdown';
import type { ResolveTag, ResolveWikiLink } from '@features/markdown/editor/MarkdownEditor';
import './Task.css';

interface TaskProps extends Omit<EntryProps, 'children'> {
  title?: string;
  dueDate?: string;
  isOverdue?: boolean;

  isChecked: boolean;

  onCheckedChange?: (checked: boolean) => void;

  /**
   * Injected exactly like the page editor's own WikiLink/Tag resolution
   * (see MarkdownEditor's props of the same name, and Note's identical
   * prop doc comment) — omitted falls back to renderCompactMarkdown's own
   * unresolved/raw-text fallback, never a second resolution
   * implementation.
   */
  resolveWikiLink?: ResolveWikiLink;
  resolveTag?: ResolveTag;
}

export function Task({
  title,
  dueDate,
  isOverdue,
  isChecked,
  onCheckedChange,
  resolveWikiLink,
  resolveTag,
  ...entryProps
}: TaskProps) {
  return (
    <Entry
      {...entryProps}
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
        <OverflowMenu
          items={[]}
          open={false}
          onOpenChange={() => {}}
          onSelect={() => {}}
          side="bottom"
          alignment="start"
        />
      }
    >
      <span className={`task-title ${isChecked ? 'is-completed' : ''}`}>
        {renderCompactMarkdown(title ?? '', { resolveWikiLink, resolveTag })}
      </span>
    </Entry>
  );
}
