import './Reference.css';
import { Button, type ButtonProps } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

interface ReferenceSummary {
  type: 'note' | 'dailyNote' | 'task';
  count: number;
}

interface ReferencesProps extends Omit<
  ButtonProps,
  'leading' | 'children' | 'onClick'
> {
  references?: ReferenceSummary[];
  isExpanded: boolean;
  onExpandToggle: () => void;
  children?: React.ReactNode;
}

export function References({
  references = [],
  isExpanded,
  onExpandToggle,
  children,
  ...buttonProps
}: ReferencesProps) {
  const totalReferences = references.reduce(
    (total, reference) => total + reference.count,
    0
  );

  const isEmpty = totalReferences === 0;

  const referenceTypes: ReferenceSummary['type'][] = [
    'note',
    'dailyNote',
    'task',
  ];

  return (
    <div className="references">
      <Button
        className="reference-button"
        interaction="subtle"
        {...buttonProps}
        disabled={isEmpty}
        onClick={onExpandToggle}
        leading={
          <AppIcon icon={isExpanded ? 'caretDown' : 'caretRight'} size={12} />
        }
      >
        References
      </Button>
      <div className="references__icons">
        {referenceTypes.map((type) => {
          const count =
            references.find((reference) => reference.type === type)?.count ?? 0;

          const icon =
            type === 'note'
              ? 'note'
              : type === 'dailyNote'
                ? 'calendar'
                : 'squareCheckOutline';

          return (
            <div
              key={type}
              className={
                count === 0
                  ? 'references__summary references__summary--disabled'
                  : 'references__summary'
              }
            >
              <AppIcon icon={icon} />
              <span>{count}</span>
            </div>
          );
        })}
      </div>
      {isExpanded && !isEmpty && children}
    </div>
  );
}
