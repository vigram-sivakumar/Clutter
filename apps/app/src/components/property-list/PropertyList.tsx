import type { ReactNode } from 'react';

import { Checkbox } from '@components/checkbox/Checkbox';
import type { PropertyType } from '@core/properties/Property.types';
import { Entry } from '@components/entry/Entry';
import { propertyTypeIcons } from '@core/properties/PropertyTypeIcons';
import { AppIcon } from '@shared/icon';

import './PropertyList.css';

type PropertyListItem =
  | {
      name: string;
      type: 'url';
      value: string;
    }
  | {
      name: string;
      type: Exclude<PropertyType, 'url'>;
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

  if (item.type === 'boolean') {
    return <Checkbox isChecked={item.value === true} />;
  }

  return item.value;
}

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

          <Entry className="property-list__value">
            <span className="primary">{renderPropertyValue(item)}</span>
          </Entry>
        </div>
      ))}
    </div>
  );
}

PropertyList.displayName = 'PropertyList';
