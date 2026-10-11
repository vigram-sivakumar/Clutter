import { Header } from '@app/layouts/sidebar/section/Section.Header';
import './Reference.css';
import { Checkbox } from '@components/checkbox/Checkbox';
import { Entry } from '@components/entry/Entry';
import { Wiki } from '@components/wiki/Wiki';

interface ReferencesProps {
  isExpanded: boolean;
  onExpandToggle: () => void;
  tasks?: React.ReactNode;
  notes?: React.ReactNode;
}

export function References({
  isExpanded = true,
  onExpandToggle,
}: ReferencesProps) {
  return (
    <section className="references">
      <Header
        interaction="subtle"
        onClick={onExpandToggle}
        isCollapsible
        title="References"
      />
      {isExpanded && (
        <div className="references__content">
          {/* Task items will be shown in this list */}
          <div className="references__list">
            <Entry
              onClick={() => {}}
              leading={<Checkbox />}
              trailing={<Wiki icon="note" emoji="🍒" title="Meeting notes" />}
            >
              <span className="reference-entry__body truncate">
                Meeting with the stakeholders about the next steps and here i go
                writing really long just to text the css
              </span>
            </Entry>
          </div>
          {/* Notes and Dailynotes will be shown in this list */}
          <div className="references__list">
            <Entry className="reference-entry" onClick={() => {}}>
              <span className="reference-entry__path truncate">
                Meeting notes
              </span>
              <span className="reference-entry__body line-clamp-2">
                Empty the trash before evening this could be or might be more
                than few lines but I think we should cap it at two lines or at
                specific words I never tried words as a max limit may be i will
                try and see how it looks with different paragraphs.
              </span>
            </Entry>
          </div>
        </div>
      )}
    </section>
  );
}
