export type PropertyType = 'text' | 'date' | 'tag' | 'boolean' | 'url' | 'number' | 'multi-select';

/**
 * The types a user-created (custom) Property can have: every type but
 * `tag`, which is the system `tags` Property's.
 *
 * Value shapes live with the list items (PropertyListItem): a `date` value
 * is the raw stored string — a local `YYYY-MM-DD` date (what the Calendar
 * picks) or a full ISO timestamp (the system-maintained `created` /
 * `modified`); a `number` is a real number; a `tag` value is the tag names
 * without their `#`, exactly as frontmatter `tags` stores them.
 */
export type CustomPropertyType = Exclude<PropertyType, 'tag'>;
