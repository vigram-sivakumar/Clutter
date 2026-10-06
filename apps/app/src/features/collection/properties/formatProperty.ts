/**
 * How a collection property's raw value is shown as text — one function per value type,
 * shared by every layout and every domain (a note's Created and an asset's Created read
 * the same). The registry says what a property IS (`type`); this says how a value of that
 * type reads. It is display only: values stay raw (ISO instants, byte counts) everywhere
 * else, so sorting never compares formatted text.
 *
 * Where a value goes on screen — a table cell, a list line, a card line — is each layout's
 * business, not this file's.
 */
import {
  COLLECTION_PROPERTIES,
  PROPERTY_IDS,
  type PropertyId,
  type PropertyValues,
} from '@core/properties/collectionProperties';
import { formatFileSize } from '@shared/helpers/fileSize';
import { formatDateDisplay, formatRelativeTimestamp } from '@shared/helpers/time/dateDisplay';
import type { ISODate } from '@shared/helpers/time/types';

/**
 * Formats a persisted timestamp (a full ISO instant, e.g. `2026-07-08T14:03:00.000Z`) for the
 * collection views — `formatRelativeTimestamp`'s local-time `35 minutes ago` (under two hours) /
 * `Today, 09:03 AM` / `Yesterday, 09:03 AM` / `12 Aug, 09:03 AM` shape. Absent or unparseable
 * renders as nothing.
 */
export function formatEntryTimestamp(isoTimestamp: string | null | undefined): string | undefined {
  if (!isoTimestamp) return undefined;
  const parsed = new Date(isoTimestamp);
  return Number.isNaN(parsed.getTime()) ? undefined : formatRelativeTimestamp(parsed);
}

/**
 * The text of one property of an item, or `undefined` when it has no value (or is media —
 * a cover is drawn, not read). Text is shown as stored.
 */
export function formatPropertyValue(id: PropertyId, values: PropertyValues): string | undefined {
  const value = values[id];

  if (value === undefined) {
    return undefined;
  }

  switch (COLLECTION_PROPERTIES[id].type) {
    case 'date':
      return formatEntryTimestamp(value as string);
    case 'day':
      // A calendar day, not an instant: the shared date label with the year always shown.
      return formatDateDisplay(value as ISODate, 'condensedFullYear');
    case 'number':
      return formatFileSize(value as number) || undefined;
    case 'text':
      return value as string;
    default:
      return undefined;
  }
}

/**
 * The properties every layout draws in a fixed place of its own rather than as one more
 * value: the name is the title, the description is the line under it, the cover is the media.
 * Every OTHER property is a plain value — a date or a size — drawn where a layout draws values
 * (a table column, a list's trailing line, a card's metadata line). This is the one shared
 * statement of that split; a property added to the registry is a value in every layout by
 * default, with no per-layout list to update.
 */
const SLOT_PROPERTIES: ReadonlySet<PropertyId> = new Set<PropertyId>(['name', 'description', 'cover']);

/** The visible properties that are drawn as plain values, in canonical order. */
export function valueProperties(visible: readonly PropertyId[]): PropertyId[] {
  return PROPERTY_IDS.filter((id) => visible.includes(id) && !SLOT_PROPERTIES.has(id));
}
