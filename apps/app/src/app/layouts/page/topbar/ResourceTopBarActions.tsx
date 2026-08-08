import { useRef, useState } from 'react';

import { Button } from '@components/button/Button';
import { Confirmation } from '@components/confirmation/Confirmation';
import { OverflowMenu } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import type {
  OverlayAlignment,
  OverlaySide,
} from '@components/overlay/Overlay.types';
import { Dialog } from '@components/dialog/Dialog';
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

type ActiveSurface =
  null | { kind: 'menu' } | { kind: 'confirmation'; action: 'delete' };

const OVERFLOW_SIDE: OverlaySide = 'bottom';
const OVERFLOW_ALIGNMENT: OverlayAlignment = 'end';

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
export function ResourceTopBarActions({
  menu,
  handlers,
}: ResourceTopBarActionsProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [surface, setSurface] = useState<ActiveSurface>(null);

  function closeSurface() {
    setSurface(null);
  }

  function handleMenuOpenChange(open: boolean) {
    if (open) {
      setSurface({ kind: 'menu' });
      return;
    }

    // OverflowMenu closes after every item select — only clear when the
    // menu itself is still the active surface so a batched confirmation
    // transition (onSelect then onOpenChange(false)) is preserved.
    setSurface((current) => (current?.kind === 'menu' ? null : current));
  }

  function handleMenuSelect(id: string) {
    if (id === 'delete') {
      setSurface({ kind: 'confirmation', action: 'delete' });
      return;
    }

    handlers?.[id]?.();
  }

  function handleDeleteConfirm() {
    console.log('Delete confirmed');
    closeSurface();
  }

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
        triggerRef={triggerRef}
        open={surface?.kind === 'menu'}
        onOpenChange={handleMenuOpenChange}
        onSelect={handleMenuSelect}
        side={OVERFLOW_SIDE}
        alignment={OVERFLOW_ALIGNMENT}
        buttonProps={{
          interaction: 'default',
        }}
      />
      <Dialog
        open={surface?.kind === 'confirmation'}
        onClose={closeSurface}
        returnFocusRef={triggerRef}
        size="medium"
      >
        {surface?.kind === 'confirmation' && surface.action === 'delete' && (
          <Confirmation
            title="Delete this item?"
            description="This action cannot be undone."
            confirmLabel="Delete"
            onConfirm={handleDeleteConfirm}
            onCancel={closeSurface}
          />
        )}
      </Dialog>
    </>
  );
}
