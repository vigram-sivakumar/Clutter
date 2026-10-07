import type { SystemIcon } from '@shared/icon';
import type {
  OverflowMenuPanelConfig,
  OverflowMenuSubmenuItemConfig,
} from '@components/menu/OverflowMenu';
import type { SidebarSort } from '@core/properties/sidebarSort';

/**
 * The fixed semantic order every resource-action menu follows (ADR-048). A group boundary is a
 * divider; adding an action means choosing its group, never placing a divider.
 */
export const RESOURCE_ACTION_GROUPS = [
  'identity',
  'organize',
  'view',
  'location',
  'lifecycle',
  'destructive',
] as const;

export type ResourceActionGroup = (typeof RESOURCE_ACTION_GROUPS)[number];

export type ResourceKind = 'note' | 'daily-note' | 'folder' | 'asset' | 'tag' | 'task';

/**
 * What an action is right now, for one resource:
 * - `enabled`: offered.
 * - `unavailable`: applies to this resource but not in its current state (a draft has nothing to
 *   move yet). The surface decides: the topbar renders it disabled (ADR-017 item 9), others omit it.
 * - `hidden`: does not apply in this state (Restore on an active resource); omitted everywhere.
 */
export type ResourceActionAvailability = 'enabled' | 'unavailable' | 'hidden';

/** The resource state the definitions' labels and availability read — facts, not behavior. */
export interface ResourceActionContext {
  readonly isDraft?: boolean;
  readonly status?: 'active' | 'archived';
  readonly isFavorite?: boolean;
  readonly isTemplate?: boolean;
  /** Permanent Delete applies only to an archived resource or an Archive descendant. */
  readonly isDeletable?: boolean;
  /** A folder's current sidebar sort; absent where the surface has no Sort by (see `sort-by`). */
  readonly sort?: SidebarSort;
  /** Assets only: which kind of file this is. */
  readonly assetKind?: 'image' | 'pdf';
  /** Assets only: a URL with no vault file — the menu swaps each file action for its URL counterpart. */
  readonly isRemote?: boolean;
  /** Assets only: `'enabled'` lists Set as cover image, `'disabled'` lists it unavailable, absent omits it. */
  readonly setAsCoverImage?: 'enabled' | 'disabled';
}

type FromContext<T> = T | ((context: ResourceActionContext) => T);

/**
 * One canonical action. `id` is also the handler key: surfaces bind it to the existing domain
 * operation through an id-keyed handler map (see `ResourceActionHandlers`).
 */
export interface ResourceActionDefinition {
  readonly id: string;
  readonly group: ResourceActionGroup;
  /** Position within the group (ascending). */
  readonly order: number;
  readonly label: FromContext<string>;
  readonly icon: FromContext<SystemIcon>;
  /** Absent means always enabled. */
  readonly availability?: (context: ResourceActionContext) => ResourceActionAvailability;
  /** Selecting it mounts and focuses an inline editor (Rename) — see `OverflowMenuItemConfig`. */
  readonly opensInlineEdit?: boolean;
  readonly submenu?: readonly OverflowMenuSubmenuItemConfig[];
  /** Swaps the menu for a panel of choices (Sort by) — see `OverflowMenuItemConfig.panel`. */
  readonly panel?: (context: ResourceActionContext) => OverflowMenuPanelConfig;
}

/** Action id → the existing operation to run. The shape the topbar already used. */
export type ResourceActionHandlers = Partial<Record<string, () => void>>;
