import { iconRegistry } from './iconRegistry';

/**
 * Valid system icon names.
 *
 * Derived from the icon registry so there's only one source of truth.
 */
export type SystemIcon = keyof typeof iconRegistry;

export type Icon =
  | {
      type: 'system';
      name: SystemIcon;
    }
  | {
      type: 'emoji';
      value: string;
    };
