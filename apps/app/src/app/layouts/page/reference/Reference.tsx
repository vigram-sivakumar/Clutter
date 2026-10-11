import { Header } from '@app/layouts/sidebar/section/Section.Header';
import './Reference.css';
import { Checkbox } from '@components/checkbox/Checkbox';
import { Wiki } from '@components/wiki/Wiki';
import { AppIcon } from '@shared/icon';

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
    <section className="reference">
      <Header
        interaction="subtle"
        onClick={onExpandToggle}
        isCollapsible
        title="References"
      />
      {isExpanded && (
        <div className="reference__content">
          <div className="reference__list">
            <div className="reference__entry">
              <Wiki icon="note" emoji="🍒" title="Meeting notes" />
              <div className="reference__main">
                <Checkbox />
                <span className="reference-entry__body line-clamp-3">
                  Empty the trash before evening this could be or might be more
                  than few.
                </span>
              </div>
            </div>
          </div>
          <span className="reference__divider" />
          <div className="reference__list">
            <div className="reference__entry">
              <Wiki icon="note" emoji="🫐" title="The dawn day" />
              <div className="reference__main">
                <span className="reference-entry__body line-clamp-3">
                  Empty the trash before evening this could be or might be more
                  than few lines but I think we should cap it at two lines or at
                  specific words I never tried words as a max limit may be i
                  will try and see how it looks with different paragraphs.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
