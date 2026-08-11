export type PropertyType = 'text' | 'boolean' | 'url' | 'multi-select';

export type PropertyValue = string | boolean | string[];

export interface Property {
  name: string;
  type: PropertyType;
  value: PropertyValue;
}
