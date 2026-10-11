import { useId, type ReactNode } from 'react';

import './ReferencesSection.css';

export interface ReferencesSectionProps {
  /** What the Tasks group shows. Supplied by whoever connects the data; nothing is shown until then. */
  tasks?: ReactNode;
  /** What the Notes and Daily Notes group shows. Supplied by whoever connects the data; nothing is shown until then. */
  notes?: ReactNode;
}

/**
 * The References section of a note or daily note: two visually distinct groups, Tasks and then Notes and Daily
 * Notes, in one section. It is structure only — it finds no references, owns no state and handles no clicks; the
 * content and behaviour of each group arrive through `tasks` and `notes`. Rendered by `PageHost` in the page body,
 * right after the editor and outside CodeMirror's DOM, so it takes the editor's own column and width.
 */
export function ReferencesSection({ tasks, notes }: ReferencesSectionProps) {
  const tasksHeadingId = useId();
  const notesHeadingId = useId();

  return (
    <section className="references-section" aria-label="References">
      <div className="references-section__group" role="group" aria-labelledby={tasksHeadingId}>
        <h3 className="references-section__heading" id={tasksHeadingId}>
          Tasks
        </h3>
        {tasks}
      </div>
      <div className="references-section__group" role="group" aria-labelledby={notesHeadingId}>
        <h3 className="references-section__heading" id={notesHeadingId}>
          Notes and Daily Notes
        </h3>
        {notes}
      </div>
    </section>
  );
}
