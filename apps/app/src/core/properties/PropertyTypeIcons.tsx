import type { PropertyType } from '@core/properties/Property.types';
import { iconRegistry } from '@shared/icon/iconRegistry';

type PropertyTypeIcon = keyof typeof iconRegistry;

export const propertyTypeIcons: Record<PropertyType, PropertyTypeIcon> = {
  text: 'description',
  boolean: 'check',
  url: 'link',
  'multi-select': 'multiLine',
};
