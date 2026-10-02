import type { ReactNode } from 'react';

import { Checkbox } from '@components/checkbox/Checkbox';
import type { PropertyType } from '@core/properties/Property.types';
import { Entry } from '@components/entry/Entry';
import { propertyTypeIcons } from '@core/properties/PropertyTypeIcons';
import { AppIcon } from '@shared/icon';

import { TextPropertyValue } from './TextPropertyValue';

import './PropertyList.css';

type PropertyListItem =
  | {
      name: string;
      type: 'url';
      value: string;
    }
  | {
      name: string;
      type: 'multi-select';
      value: readonly string[];
    }
  | {
      name: string;
      type: 'text';
      value: string;
      /**
       * Makes the value editable (multiline — see TextPropertyValue).
       * Omitted for a display-only text Property (e.g. the system-maintained
       * Created/Modified timestamps), which renders as plain text.
       */
      onCommit?(value: string): void;
    }
  | {
      name: string;
      type: Exclude<PropertyType, 'url' | 'multi-select' | 'text'>;
      value: ReactNode;
    };

interface PropertyListProps {
  items: PropertyListItem[];
  className?: string;
}

function renderPropertyValue(item: PropertyListItem) {
  if (item.type === 'url') {
    return (
      <a href={item.value} target="_blank" rel="noopener noreferrer">
        {item.value}
      </a>
    );
  }

  if (item.type === 'multi-select') {
    return item.value.map((entry) => (
      <span key={entry} className="property-list__chip">
        {entry}
      </span>
    ));
  }

  if (item.type === 'boolean') {
    return <Checkbox isChecked={item.value === true} />;
  }

  return item.value;
}

export type { PropertyListItem };

export function PropertyList({ items, className }: PropertyListProps) {
  if (items.length === 0) {
    return null;
  }

  const classes = ['property-list', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {items.map((item) => (
        <div key={item.name} className="property-list__row">
          <Entry
            className="property-list__name"
            leading={
              <AppIcon
                className="property__icon"
                icon={propertyTypeIcons[item.type]}
              />
            }
          >
            <span>{item.name}</span>
          </Entry>

          {item.type === 'text' && item.onCommit ? (
            <TextPropertyValue
              name={item.name}
              value={item.value}
              onCommit={item.onCommit}
            />
          ) : (
            <Entry className="property-list__value">
              <span>{renderPropertyValue(item)}</span>
            </Entry>
          )}
        </div>
      ))}
    </div>
  );
}

PropertyList.displayName = 'PropertyList';
