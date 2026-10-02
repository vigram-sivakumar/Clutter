import type { ReactNode } from 'react';

import { Checkbox } from '@components/checkbox/Checkbox';
import type { PropertyType } from '@core/properties/Property.types';
import type { iconRegistry } from '@shared/icon/iconRegistry';

import { DatePropertyValue } from './DatePropertyValue';
import type { PropertyListItem, PropertyListItemOf } from './PropertyList.types';
import { PropertyValueCell } from './PropertyValueCell';
import { TextPropertyValue } from './TextPropertyValue';
import { formatDatePropertyEditValue, formatDatePropertyValue } from './formatDatePropertyValue';

interface PropertyTypeDefinition<Type extends PropertyType> {
  icon: keyof typeof iconRegistry;
  /** Display formatting for a raw stored value, for types whose display differs from the stored value. */
  format?(value: string): string;
  /** Formatting for the value while it's editable in place, when that differs from `format`. */
  editFormat?(value: string): string;
  /** Renders the value cell — the type's value component, which reads the item's own `editable`. */
  renderValue(item: PropertyListItemOf<Type>): ReactNode;
}

/**
 * The single source of truth for what each Property type looks like:
 * its icon, its value formatting, and its value component. PropertyList
 * reads this instead of branching on `type` itself. Editability is not
 * part of a type's definition — it arrives on each item.
 */
export const propertyTypeRegistry: { [Type in PropertyType]: PropertyTypeDefinition<Type> } = {
  text: {
    icon: 'description',
    renderValue: (item) => <TextPropertyValue {...item} />,
  },
  date: {
    icon: 'calendar',
    format: formatDatePropertyValue,
    editFormat: formatDatePropertyEditValue,
    renderValue: (item) => (
      <DatePropertyValue
        {...item}
        format={formatDatePropertyValue}
        editFormat={formatDatePropertyEditValue}
      />
    ),
  },
  boolean: {
    icon: 'check',
    renderValue: (item) => (
      <PropertyValueCell>
        <Checkbox isChecked={item.value === true} />
      </PropertyValueCell>
    ),
  },
  url: {
    icon: 'link',
    renderValue: (item) => (
      <PropertyValueCell>
        <a href={item.value} target="_blank" rel="noopener noreferrer">
          {item.value}
        </a>
      </PropertyValueCell>
    ),
  },
  'multi-select': {
    icon: 'multiLine',
    renderValue: (item) => (
      <PropertyValueCell>
        {item.value.map((entry) => (
          <span key={entry} className="property-list__chip">
            {entry}
          </span>
        ))}
      </PropertyValueCell>
    ),
  },
};

/**
 * Looks up `item`'s type definition and renders its value. The one cast
 * here is the standard correlated-union limitation: TypeScript can't see
 * that `propertyTypeRegistry[item.type]` and `item` share the same `type`.
 */
export function renderPropertyValue(item: PropertyListItem): ReactNode {
  const definition = propertyTypeRegistry[item.type] as PropertyTypeDefinition<PropertyType> & {
    renderValue(item: PropertyListItem): ReactNode;
  };

  return definition.renderValue(item);
}
