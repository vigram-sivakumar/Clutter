import type { ReactNode } from 'react';

import type { PropertyType } from '@core/properties/Property.types';
import type { iconRegistry } from '@shared/icon/iconRegistry';

import { CheckboxPropertyValue } from './CheckboxPropertyValue';
import { DatePropertyValue } from './DatePropertyValue';
import type { PropertyListItem, PropertyListItemOf } from './PropertyList.types';
import { MultiSelectPropertyValue } from './MultiSelectPropertyValue';
import { NumberPropertyValue } from './NumberPropertyValue';
import { TagPropertyValue } from './TagPropertyValue';
import { TextPropertyValue } from './TextPropertyValue';
import { UrlPropertyValue } from './UrlPropertyValue';
import { formatDatePropertyValue } from './formatDatePropertyValue';

interface PropertyTypeDefinition<Type extends PropertyType> {
  icon: keyof typeof iconRegistry;
  /** Display formatting for a raw stored value, for types whose display differs from the stored value. */
  format?(value: string): string;
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
    renderValue: (item) => <DatePropertyValue {...item} format={formatDatePropertyValue} />,
  },
  tag: {
    icon: 'tag',
    renderValue: (item) => <TagPropertyValue {...item} />,
  },
  boolean: {
    icon: 'check',
    renderValue: (item) => <CheckboxPropertyValue {...item} />,
  },
  url: {
    icon: 'link',
    renderValue: (item) => <UrlPropertyValue {...item} />,
  },
  number: {
    icon: 'hash',
    renderValue: (item) => <NumberPropertyValue {...item} />,
  },
  'multi-select': {
    icon: 'multiLine',
    renderValue: (item) => <MultiSelectPropertyValue {...item} />,
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
