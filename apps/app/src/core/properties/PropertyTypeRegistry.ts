import type {
  PropertyType,
  PropertyValueByType,
} from '@core/properties/Property.types';
import type { iconRegistry } from '@shared/icon/iconRegistry';

type PropertyTypeIcon = keyof typeof iconRegistry;

/**
 * Reference to the future value editor for a type. Intentionally an id, not
 * a component: no editors exist yet, and core stays free of UI imports. A
 * later task maps these ids to components (date picker, tag autocomplete, …).
 */
export type PropertyEditorSlot =
  | 'text-input'
  | 'date-picker'
  | 'tag-autocomplete'
  | 'url-editor'
  | 'toggle'
  | 'number-input'
  | 'multi-select-popover';

export interface PropertyTypeDefinition<T extends PropertyType> {
  type: T;
  label: string;
  icon: PropertyTypeIcon;
  /** Plain-text rendering of a value (also the fallback/accessible text). */
  format: (value: PropertyValueByType[T]) => string;
  editor: PropertyEditorSlot;
}

export function formatTimestamp(iso: string | null): string {
  if (!iso) {
    return '';
  }

  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

const joinList = (values: readonly string[]) => values.join(', ');

export const propertyTypeRegistry: {
  [T in PropertyType]: PropertyTypeDefinition<T>;
} = {
  text: {
    type: 'text',
    label: 'Text',
    icon: 'description',
    format: (value) => value,
    editor: 'text-input',
  },
  date: {
    type: 'date',
    label: 'Date',
    icon: 'calendar',
    format: formatTimestamp,
    editor: 'date-picker',
  },
  tag: {
    type: 'tag',
    label: 'Tag',
    icon: 'tag',
    format: joinList,
    editor: 'tag-autocomplete',
  },
  url: {
    type: 'url',
    label: 'URL',
    icon: 'link',
    format: (value) => value,
    editor: 'url-editor',
  },
  boolean: {
    type: 'boolean',
    label: 'Checkbox',
    icon: 'check',
    format: (value) => (value ? 'Yes' : 'No'),
    editor: 'toggle',
  },
  number: {
    type: 'number',
    label: 'Number',
    icon: 'hash',
    format: (value) => (value === null ? '' : String(value)),
    editor: 'number-input',
  },
  'multi-select': {
    type: 'multi-select',
    label: 'Multi-select',
    icon: 'multiLine',
    format: joinList,
    editor: 'multi-select-popover',
  },
};

export function getPropertyTypeDefinition<T extends PropertyType>(
  type: T
): PropertyTypeDefinition<T> {
  return propertyTypeRegistry[type];
}
