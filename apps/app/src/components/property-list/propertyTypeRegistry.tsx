import type { ReactNode } from 'react';

import type { CustomPropertyType, PropertyType } from '@core/properties/Property.types';
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
  /** What the type is called where one is chosen (the property picker). */
  label: string;
  /**
   * Whether a user can create a Property of this type. Only `tag` is not:
   * it is the system `tags` Property's own type.
   */
  custom: boolean;
  /** Renders the value cell — the type's value component, which reads the item's own `editable`. */
  renderValue(item: PropertyListItemOf<Type>): ReactNode;
}

/**
 * The single source of truth for what each Property type looks like:
 * its icon, its picker label, and its value component. PropertyList
 * reads this instead of branching on `type` itself. Editability is not
 * part of a type's definition — it arrives on each item.
 */
export const propertyTypeRegistry: { [Type in PropertyType]: PropertyTypeDefinition<Type> } = {
  // Order is the order the property picker lists the custom types in.
  text: {
    icon: 'description',
    label: 'Text',
    custom: true,
    renderValue: (item) => <TextPropertyValue {...item} />,
  },
  date: {
    icon: 'calendar',
    label: 'Date',
    custom: true,
    renderValue: (item) => <DatePropertyValue {...item} format={formatDatePropertyValue} />,
  },
  url: {
    icon: 'link',
    label: 'URL',
    custom: true,
    renderValue: (item) => <UrlPropertyValue {...item} />,
  },
  number: {
    icon: 'hash',
    label: 'Number',
    custom: true,
    renderValue: (item) => <NumberPropertyValue {...item} />,
  },
  boolean: {
    icon: 'check',
    label: 'Boolean',
    custom: true,
    renderValue: (item) => <CheckboxPropertyValue {...item} />,
  },
  'multi-select': {
    icon: 'multiLine',
    label: 'Multi-select',
    custom: true,
    renderValue: (item) => <MultiSelectPropertyValue {...item} />,
  },
  tag: {
    icon: 'tag',
    label: 'Tags',
    custom: false,
    renderValue: (item) => <TagPropertyValue {...item} />,
  },
};

/** One custom Property type a user can add, as the property picker lists it. */
export interface CustomPropertyTypeOption {
  type: CustomPropertyType;
  label: string;
  icon: keyof typeof iconRegistry;
}

/** The custom types, in registry order — derived from the registry, never a second list. */
export function customPropertyTypeOptions(): CustomPropertyTypeOption[] {
  return (Object.keys(propertyTypeRegistry) as PropertyType[]).flatMap((type) => {
    const definition = propertyTypeRegistry[type];

    return definition.custom
      ? [{ type: type as CustomPropertyType, label: definition.label, icon: definition.icon }]
      : [];
  });
}

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
