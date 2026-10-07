import type { MoveZone } from '@core/vault/initialize/ReservedResources';

import type { ResourceActionContext, ResourceKind } from './resourceActionTypes';

/**
 * Which hierarchy a resource moves within (ADR-049) — the one rule the canonical `move-to` action's
 * callers use to pick the Move picker's root, so the resource itself decides, never the surface
 * it happens to be shown on (a Template listed under a tag is still a Template):
 *
 *   Note → the vault root's workspace    Template → Templates    Asset → Assets
 *
 * A folder moves within the hierarchy it already sits in; the caller passes that as `moveZone`
 * (MembershipSelector.getMoveZoneOfFolder), since a folder's own context carries no flag for it.
 */
export function moveZoneFor(kind: ResourceKind, context: ResourceActionContext): MoveZone {
  if (kind === 'asset') {
    return 'assets';
  }

  if (kind === 'note') {
    return context.isTemplate ? 'templates' : 'workspace';
  }

  if (kind === 'folder') {
    return context.moveZone ?? 'workspace';
  }

  return 'workspace';
}
