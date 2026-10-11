import { Header } from '@app/layouts/sidebar/section/Section.Header';
import './Reference.css';

interface ReferencesProps {
  isExpanded: boolean;
  onExpandToggle: () => void;
  tasks?: React.ReactNode;
  notes?: React.ReactNode;
  dailyNotes?: React.ReactNode;
}

export function References({
  isExpanded = true,
  onExpandToggle,
  tasks,
  notes,
  dailyNotes,
}: ReferencesProps) {
  const groups = [
    { key: 'tasks', content: tasks },
    { key: 'notes', content: notes },
    { key: 'daily-notes', content: dailyNotes },
  ].filter((group) => group.content != null);

  if (groups.length === 0) {
    return null;
  }

  return (
    <section className="reference">
      <Header
        interaction="subtle"
        onClick={onExpandToggle}
        isCollapsible
        title="References"
      />

      {isExpanded && (
        <div className="reference__content">
          {groups.map((group, index) => (
            <div key={group.key} className="reference__group">
              {index > 0 && <span className="reference__divider" />}

              <div className="reference__list">{group.content}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
