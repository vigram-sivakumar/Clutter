export type PropertyType = 'text' | 'date' | 'tag' | 'boolean' | 'url' | 'number' | 'multi-select';

/**
 * The types a user-created (custom) Property can have: every type but
 * `tag`, which is the system `tags` Property's.
 */
export type CustomPropertyType = Exclude<PropertyType, 'tag'>;

/**
 * A `date` Property's value is the raw stored string, never a formatted
 * one: a local `YYYY-MM-DD` date (what the Calendar picks) or a full ISO
 * timestamp (the system-maintained `created`/`modified`).
 *
 * A `number` Property's value is a real number, never a formatted string.
 */
export type PropertyValue = string | number | boolean | string[];

/*
 * A `tag` Property's value is the tag names without their `#` — exactly as
 * frontmatter `tags` stores them; the `#` is presentation only.
 */

export interface Property {
  name: string;
  type: PropertyType;
  value: PropertyValue;
  /**
   * Whether the user may change the value — decided by whoever produces the
   * Property (system metadata vs. a user-created Property), never inferred
   * from `type` or `name`.
   */
  editable: boolean;
}
