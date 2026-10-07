import type { MovePickerZone } from '@core/vault/initialize/ReservedResources';

import type { ResourceActionContext, ResourceKind } from './resourceActionTypes';

/**
 * Which hierarchy a resource's Move picker is rooted at (ADR-049) — decided by the resource, never
 * by the surface it is shown on:
 *
 *   Note → the vault root's workspace      Asset → Assets
 *
 * A Template has no Move at all (Templates are a flat collection; the canonical `move-to` action is
 * hidden for one), so it has no zone. A folder moves within the hierarchy it already sits in; the
 * caller passes that as `moveZone` (MembershipSelector.getMoveZoneOfFolder).
 */
export function moveZoneFor(kind: ResourceKind, context: ResourceActionContext): MovePickerZone {
  if (kind === 'asset') {
    return 'assets';
  }

  if (kind === 'folder' && context.moveZone === 'assets') {
    return 'assets';
  }

  return 'workspace';
}
