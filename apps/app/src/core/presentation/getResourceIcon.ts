import type { SystemIcon } from '@shared/icon';
import type { VaultResourceKind } from '@core/vault/models/VaultResource';

/**
 * Returns the canonical icon for a VaultResource kind — the resource-scoped
 * counterpart to getPageIcon.ts, kept separate rather than folded into that
 * switch: getPageIcon's parameter type is the closed `PageType | 'folder' |
 * 'tag'` union, and VaultResourceKind is a different, unrelated closed
 * union — merging them would widen a signature several existing callers
 * already pattern-match on, for no shared behavior (a resource has no
 * per-instance override the way `isToday` is for daily notes).
 */
export function getResourceIcon(kind: VaultResourceKind): SystemIcon {
  switch (kind) {
    case 'image':
      return 'image';
    case 'pdf':
      return 'pdf';
  }
}
