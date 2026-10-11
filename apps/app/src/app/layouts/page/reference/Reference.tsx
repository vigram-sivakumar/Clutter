import { Fragment } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

import { Header } from '@app/layouts/sidebar/section/Section.Header';
import { Checkbox } from '@components/checkbox/Checkbox';
import { Wiki } from '@components/wiki/Wiki';
import type { SystemIcon } from '@shared/icon';
import './Reference.css';

interface ReferencesProps {
  isExpanded: boolean;
  onExpandToggle: () => void;
  /** The task list. Null (or omitted) when there are no task references. */
  tasks?: ReactNode;
  /** One list for notes and daily notes together. Null (or omitted) when there are none. */
  notes?: ReactNode;
}

export function References({
  isExpanded = true,
  onExpandToggle,
  tasks,
  notes,
}: ReferencesProps) {
  const lists = [
    { key: 'tasks', content: tasks },
    { key: 'notes', content: notes },
  ].filter((list) => list.content != null);

  if (lists.length === 0) {
    return null;
  }

  return (
    <section className="reference">
      <Header
        interaction="subtle"
        title="References"
        isCollapsible
        isTitleToggle
        isExpanded={isExpanded}
        onExpandToggle={onExpandToggle}
      />
      {isExpanded && (
        <div className="reference__content">
          {lists.map((list, index) => (
            <Fragment key={list.key}>
              {index > 0 && <span className="reference__divider" />}
              <div className="reference__list">{list.content}</div>
            </Fragment>
          ))}
        </div>
      )}
    </section>
  );
}

interface ReferenceEntryProps {
  /** The source page's own identity — what the Wiki header shows. */
  icon: SystemIcon;
  emoji?: string;
  title: string;
  /** The clamped context: a task's text, or the line that references the open page. */
  children: ReactNode;
  /** Present only for a task: renders the checkbox. */
  isChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Opens the source page (and reveals the reference). */
  onOpen: () => void;
}

export function ReferenceEntry({
  icon,
  emoji,
  title,
  children,
  isChecked,
  onCheckedChange,
  onOpen,
}: ReferenceEntryProps) {
  // The checkbox is its own control: toggling a task must not also open its note.
  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (!(event.target as HTMLElement).closest('[role="checkbox"]')) {
      onOpen();
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div className="reference__entry" role="button" tabIndex={0} onClick={onClick} onKeyDown={onKeyDown}>
      <Wiki icon={icon} emoji={emoji} title={title} />
      <div className="reference__main">
        {onCheckedChange && <Checkbox isChecked={isChecked} onCheckedChange={onCheckedChange} />}
        <span className={`reference-entry__body line-clamp-3${isChecked ? ' is-completed' : ''}`}>{children}</span>
      </div>
    </div>
  );
}
