import { Entry } from '@components/entry/Entry';
import { AppIcon } from '@shared/icon';

import type { PropertyListItem } from './PropertyList.types';
import { propertyTypeRegistry, renderPropertyValue } from './propertyTypeRegistry';

import './PropertyList.css';

interface PropertyListProps {
  items: PropertyListItem[];
  className?: string;
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
                icon={propertyTypeRegistry[item.type].icon}
              />
            }
          >
            <span>{item.name}</span>
          </Entry>

          {renderPropertyValue(item)}
        </div>
      ))}
    </div>
  );
}

PropertyList.displayName = 'PropertyList';
