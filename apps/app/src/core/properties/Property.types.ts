/**
 * Semantic property model. A Property stores its semantic `type` and raw
 * `value` only — never presentation (icon, component, formatted text).
 * Presentation is resolved from the type via `PropertyTypeRegistry`.
 */
export type PropertyType =
  | 'text'
  | 'date'
  | 'tag'
  | 'url'
  | 'boolean'
  | 'number'
  | 'multi-select';

export interface PropertyValueByType {
  text: string;
  /** ISO-8601 timestamp; `null` when unset. */
  date: string | null;
  tag: readonly string[];
  url: string;
  boolean: boolean;
  number: number | null;
  'multi-select': readonly string[];
}

export type PropertyValue<T extends PropertyType = PropertyType> =
  PropertyValueByType[T];

export type Property = {
  [T in PropertyType]: { name: string; type: T; value: PropertyValueByType[T] };
}[PropertyType];
