import { Checkbox } from '@components/checkbox/Checkbox';
import type { Property } from '@core/properties/Property.types';
import { Entry } from '@components/entry/Entry';
import { propertyTypeRegistry } from '@core/properties/PropertyTypeRegistry';
import { AppIcon } from '@shared/icon';

import './PropertyList.css';

type PropertyListItem = Property;

interface PropertyListProps {
  items: PropertyListItem[];
  className?: string;
}

function renderPropertyValue(item: PropertyListItem) {
  switch (item.type) {
    case 'url':
      return (
        <a href={item.value} target="_blank" rel="noopener noreferrer">
          {item.value}
        </a>
      );
    case 'tag':
    case 'multi-select':
      return item.value.map((entry) => (
        <span key={entry} className="property-list__chip">
          {entry}
        </span>
      ));
    case 'boolean':
      return <Checkbox isChecked={item.value} />;
    case 'text':
      return propertyTypeRegistry.text.format(item.value);
    case 'date':
      return propertyTypeRegistry.date.format(item.value);
    case 'number':
      return propertyTypeRegistry.number.format(item.value);
  }
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

          <Entry className="property-list__value">
            <span className="primary">{renderPropertyValue(item)}</span>
          </Entry>
        </div>
      ))}
    </div>
  );
}

PropertyList.displayName = 'PropertyList';
