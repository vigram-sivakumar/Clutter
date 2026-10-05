/**
 * The one place a collection's configuration is resolved — a pure function of three inputs
 * and nothing else:
 *
 *   property registry   (what properties exist, in what order, which can sort)
 * + CollectionDefinition (which of them this collection offers and shows by default, its
 *                         layouts, default sort, and which properties each layout requires)
 * + CollectionViewConfig (what this user chose)
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *   → ResolvedCollectionView
 *
 * Configure → Properties, Configure → Sort and every layout read this result; none of them
 * resolves anything itself. Rules, in order:
 *  - membership comes from the definition; ORDER comes from the registry — a definition's
 *    `properties` array order never reaches the UI;
 *  - default visibility comes from the definition, and the user's overrides modify it;
 *  - a property the layout REQUIRES is always visible and locked, whatever was persisted
 *    (a stored `false` for it is ignored, and `setPropertyVisibility` never writes one);
 *  - an unsupported layout or an invalid sort (a property the collection doesn't offer, or one
 *    that can't be sorted) falls back to the definition's default.
 */
import {
  PROPERTY_IDS,
  isSortableProperty,
  type PropertyId,
} from '@core/properties/collectionProperties';
import type { CollectionSort } from '@core/properties/collectionSort';
import type {
  CollectionLayout,
  CollectionViewConfig,
  LegacyCollectionProperties,
  PersistedCollectionViewConfig,
  PropertyOverrides,
} from '@core/properties/collectionViewConfig';

import { DEFAULT_REQUIRED, type CollectionDefinition } from './collectionDefinitions';

export interface ResolvedCollectionView {
  readonly layout: CollectionLayout;
  /** Every property the collection offers, in canonical (registry) order. */
  readonly available: readonly PropertyId[];
  /** The properties currently shown, in canonical order — required ones included. */
  readonly visible: readonly PropertyId[];
  /** The visible properties the current layout requires: shown, and not toggleable. */
  readonly locked: readonly PropertyId[];
  /** The available properties that can be sorted by, in canonical order: Sort by's rows. */
  readonly sortable: readonly PropertyId[];
  readonly sort: CollectionSort;
}

/** The properties `layout` requires of a collection that offers them. */
export function requiredProperties(definition: CollectionDefinition, layout: CollectionLayout): readonly PropertyId[] {
  return (definition.required ?? DEFAULT_REQUIRED)[layout] ?? [];
}

export function availableProperties(definition: CollectionDefinition): readonly PropertyId[] {
  return PROPERTY_IDS.filter((id) => definition.properties.includes(id));
}

export function resolveCollectionView(
  definition: CollectionDefinition,
  config: CollectionViewConfig = {}
): ResolvedCollectionView {
  const layout =
    config.layout !== undefined && definition.layouts.includes(config.layout) ? config.layout : definition.defaultLayout;

  const available = availableProperties(definition);
  const required = requiredProperties(definition, layout);
  const locked = available.filter((id) => required.includes(id));
  const visible = available.filter(
    (id) => locked.includes(id) || (config.propertyOverrides?.[id] ?? definition.defaultVisible.includes(id))
  );
  const sortable = available.filter(isSortableProperty);
  const sort =
    config.sort !== undefined && sortable.includes(config.sort.property) ? config.sort : definition.defaultSort;

  return { layout, available, visible, locked, sortable, sort };
}

/**
 * The overrides that result from the user turning `id` on or off in `layout`. A property that
 * is not offered, or that the layout requires, can't be toggled: the overrides come back
 * unchanged, so a required property can never be persisted as hidden. Turning a property to
 * its default removes its override (no opinion), so the collection keeps following its default.
 * `undefined` when no override is left.
 */
export function setPropertyVisibility(
  definition: CollectionDefinition,
  layout: CollectionLayout,
  overrides: PropertyOverrides | undefined,
  id: PropertyId,
  visible: boolean
): PropertyOverrides | undefined {
  if (!definition.properties.includes(id) || requiredProperties(definition, layout).includes(id)) {
    return overrides;
  }

  const next: Partial<Record<PropertyId, boolean>> = { ...overrides };

  if (visible === definition.defaultVisible.includes(id)) {
    delete next[id];
  } else {
    next[id] = visible;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * The retired snapshot's keys, as the property each one now is. `title` was the Asset card's
 * name; `preview` is dead and has no property.
 */
const LEGACY_KEY_TO_PROPERTY: Readonly<Record<Exclude<keyof LegacyCollectionProperties, 'preview'>, PropertyId>> = {
  description: 'description',
  cover: 'cover',
  size: 'size',
  created: 'created',
  updated: 'updated',
  archived: 'archived',
  title: 'name',
};

/**
 * Converts a retired full snapshot into overrides against THIS collection's defaults. Only a
 * value that differs from the default is an override — the snapshot recorded every default
 * too, and a default is not a choice. A property the collection doesn't offer is ignored
 * (the snapshot held eight keys whatever the collection), `preview` is dropped, and `title`
 * becomes the name's override. Required-ness is not applied here: it is a property of a
 * layout, enforced at resolve time.
 */
export function migrateLegacyProperties(
  definition: CollectionDefinition,
  legacy: LegacyCollectionProperties | undefined
): PropertyOverrides | undefined {
  if (legacy === undefined) {
    return undefined;
  }

  const overrides: Partial<Record<PropertyId, boolean>> = {};

  for (const [key, property] of Object.entries(LEGACY_KEY_TO_PROPERTY) as Array<
    [keyof typeof LEGACY_KEY_TO_PROPERTY, PropertyId]
  >) {
    const stored = legacy[key];

    if (stored !== undefined && definition.properties.includes(property) && stored !== definition.defaultVisible.includes(property)) {
      overrides[property] = stored;
    }
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

/**
 * A stored entry as plain intent: its new-shape overrides, or — for an entry written before
 * the migration — its legacy snapshot converted against `definition`. New wins when an entry
 * somehow has both.
 */
export function toCollectionViewConfig(
  definition: CollectionDefinition,
  persisted: PersistedCollectionViewConfig | undefined
): CollectionViewConfig {
  if (persisted === undefined) {
    return {};
  }

  const { legacyProperties, ...config } = persisted;
  const propertyOverrides = config.propertyOverrides ?? migrateLegacyProperties(definition, legacyProperties);

  return propertyOverrides === undefined ? config : { ...config, propertyOverrides };
}
