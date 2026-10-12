import { Fragment } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

import { Header } from '@app/layouts/sidebar/section/Section.Header';
import { Checkbox } from '@components/checkbox/Checkbox';
import './Reference.css';

interface ReferencesProps {
  /** How many references there are in all (every occurrence), for the header: "3 References". */
  count: number;
  isExpanded: boolean;
  onExpandToggle: () => void;
  /** The task list. Null (or omitted) when there are no task references. */
  tasks?: ReactNode;
  /** One list for notes and daily notes together. Null (or omitted) when there are none. */
  notes?: ReactNode;
}

export function References({
  count,
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
        title={`${count} ${count === 1 ? 'Reference' : 'References'}`}
        isCollapsible
        isTitleToggle
        isExpanded={isExpanded}
        onExpandToggle={onExpandToggle}
      />
      {isExpanded && (
        <div className="reference__content">
          <span className="reference__divider" />
          {lists.map((list, index) => (
            <Fragment key={list.key}>
              {index > 0 && <span className="reference__divider" />}
              <div className={`reference__list reference__${list.key}`}>
                {list.content}
              </div>
            </Fragment>
          ))}
        </div>
      )}
    </section>
  );
}

interface ReferenceGroupProps {
  /** The source page's title. */
  title: string;
  /** Opens the source page. */
  onOpen: () => void;
  /** The group's `ReferenceEntry` items: every reference from this page, one each. */
  children: ReactNode;
}

/** One source page: its heading (its own click target) above its references (each their own). */
export function ReferenceGroup({
  title,
  onOpen,
  children,
}: ReferenceGroupProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div className="reference__group">
      <div
        className="reference__heading"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={onKeyDown}
      >
        {title}
      </div>
      <div className="reference__occurrences">{children}</div>
    </div>
  );
}

interface ReferenceEntryProps {
  /** The compact context: a task's text, or the line that references the open page. Shown when there is no `preview`. */
  children?: ReactNode;
  /**
   * A read-only editor preview of the reference's Markdown (`ReferencePreview`, which is itself the entry's body
   * element), shown instead of `children`. Absent when no block could be extracted — the compact `children` is the fallback.
   */
  preview?: ReactNode;
  /** Present only for a task: renders the checkbox. */
  isChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Opens the source page (and reveals the reference). */
  onOpen: () => void;
}

export function ReferenceEntry({
  children,
  preview,
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
    if (
      event.target === event.currentTarget &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      className="reference__entry"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {onCheckedChange && (
        <Checkbox isChecked={isChecked} onCheckedChange={onCheckedChange} />
      )}
      {preview !== undefined ? (
        preview
      ) : (
        <span
          className={`reference-entry__body line-clamp-3${isChecked ? ' is-completed' : ''}`}
        >
          {children}
        </span>
      )}
    </div>
  );
}
