import { useState } from 'react';

import { Button } from '@components/button/Button';
import { OverflowMenu } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { AppIcon } from '@shared/icon';
import type { PageStatus } from '@core/vault/models/PageMetadata';

/**
 * A page's top-bar-relevant lifecycle state: its persisted `PageStatus`,
 * or the explicit `'draft'` state for an unpersisted `PageOperations`
 * draft (ADR-017) — a real, named third value, never represented as
 * `undefined`/`null` standing in for "not yet persisted" (a menu builder
 * that forgot to check would otherwise silently treat a draft as active).
 */
export type TopBarPageState = PageStatus | 'draft';

/**
 * Re-exported from OverflowMenu, the generic primitive this menu shape
 * actually belongs to (ADR-017 Decision item 9 / ADR-016 Finding A's
 * "disabled, not silently inert" pattern governs the `disabled` field) —
 * kept under this name so every existing importer (buildTopBarActions.tsx,
 * topBarRegistry.tsx, the per-type menu configs) is unaffected.
 */
export type TopBarMenuItemConfig = OverflowMenuItemConfig;

export interface ResourceTopBarActionsProps {
  menu: readonly TopBarMenuItemConfig[];
  handlers?: Partial<Record<string, () => void>>;
}

/**
 * Shared overflow-menu top bar actions for any resource type (note,
 * daily note, folder). Each resource passes its own menu config and a
 * handlers map keyed by menu item id — items with no matching handler
 * still render but only close the menu when clicked, exactly as every
 * currently-unwired item already behaves today.
 */
export function ResourceTopBarActions({ menu, handlers }: ResourceTopBarActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="medium" isIconOnly>
        <AppIcon icon={'favouriteOutline'} />
      </Button>
      <Button size="medium" isIconOnly>
        <AppIcon icon={'widthFill'} />
      </Button>
      <OverflowMenu
        items={menu}
        open={open}
        onOpenChange={setOpen}
        onSelect={(id) => handlers?.[id]?.()}
      />
    </>
  );
}
