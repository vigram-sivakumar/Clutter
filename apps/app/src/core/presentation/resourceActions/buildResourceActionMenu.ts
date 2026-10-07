import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';

import { RESOURCE_ACTION_SURFACES, type ResourceActionSurface } from './resourceActionSurfaces';
import {
  RESOURCE_ACTION_GROUPS,
  type ResourceActionContext,
  type ResourceActionDefinition,
  type ResourceKind,
} from './resourceActionTypes';
import { RESOURCE_ACTIONS } from './resourceActionDefinitions';

function resolve<T>(value: T | ((context: ResourceActionContext) => T), context: ResourceActionContext): T {
  return typeof value === 'function' ? (value as (context: ResourceActionContext) => T)(context) : value;
}

/**
 * Builds a resource's menu for one surface from its canonical definitions (ADR-048): drops what the
 * surface omits and what is hidden, orders by group then order, and sets `separatorBefore` on the
 * first item of each group after the first — the only place a divider is decided.
 */
export function buildResourceActionMenu(
  kind: ResourceKind,
  context: ResourceActionContext,
  surface: ResourceActionSurface
): OverflowMenuItemConfig[] {
  return buildMenuFromDefinitions(RESOURCE_ACTIONS[kind], context, surface, kind);
}

/** The builder over an explicit definition list — what `buildResourceActionMenu` runs on a kind's. */
export function buildMenuFromDefinitions(
  definitions: readonly ResourceActionDefinition[],
  context: ResourceActionContext,
  surface: ResourceActionSurface,
  kind?: ResourceKind
): OverflowMenuItemConfig[] {
  const profile = RESOURCE_ACTION_SURFACES[surface];
  const omitted = [...profile.omit, ...(kind ? (profile.omitWhen?.(kind, context) ?? []) : [])];
  const items: { definition: ResourceActionDefinition; disabled: boolean }[] = [];

  for (const definition of definitions) {
    if (omitted.includes(definition.id)) {
      continue;
    }

    const availability = definition.availability?.(context) ?? 'enabled';

    if (availability === 'hidden' || (availability === 'unavailable' && profile.unavailable === 'hide')) {
      continue;
    }

    items.push({ definition, disabled: availability === 'unavailable' });
  }

  items.sort(
    (a, b) =>
      RESOURCE_ACTION_GROUPS.indexOf(a.definition.group) - RESOURCE_ACTION_GROUPS.indexOf(b.definition.group) ||
      a.definition.order - b.definition.order
  );

  return items.map(({ definition, disabled }, index) => {
    const previous = items[index - 1]?.definition;
    const item: OverflowMenuItemConfig = {
      id: definition.id,
      label: resolve(definition.label, context),
      icon: resolve(definition.icon, context),
    };

    if (disabled) {
      item.disabled = true;
    }
    if (definition.opensInlineEdit) {
      item.opensInlineEdit = true;
    }
    if (definition.submenu) {
      item.submenu = [...definition.submenu];
    }
    if (definition.panel) {
      item.panel = definition.panel(context);
    }
    if (previous && previous.group !== definition.group) {
      item.separatorBefore = true;
    }

    return item;
  });
}
