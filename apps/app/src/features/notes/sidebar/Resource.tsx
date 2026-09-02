import { Entry, type EntryProps } from '@components/entry/Entry';
import { AppIcon } from '@shared/icon';
import { getResourceIcon } from '@core/presentation/getResourceIcon';
import type { VaultResource } from '@core/vault/models/VaultResource';

import './Resource.css';

export interface ResourceProps
  extends Omit<EntryProps, 'children' | 'onClick' | 'resource'> {
  resource: VaultResource;
  /**
   * Invoked on click — but only ever wired through to Entry for an image
   * (see below). A PDF resource has no click behavior yet (per product
   * decision: no viewer exists), so this row renders non-interactive for
   * one, exactly the way a draft Note row with no menu items renders an
   * inert overflow button rather than a fake one.
   */
  onClick?(resource: VaultResource): void;
}

/**
 * One row component for every supported non-Markdown resource kind
 * (image, pdf) — not a separate Image/Pdf component pair, since both are
 * the same shape (icon + name, no draft/rename/session concept) and differ
 * only in which icon renders and whether a click does anything. Mirrors
 * Note.tsx's use of Entry exactly (same leading/actions slot shape); has no
 * overflow menu yet — Rename/Favorite/Archive have no write path for a
 * VaultResource today (no Vault mutation method, no Persistence Gate
 * operation kind, nowhere to persist a resource's favorite/archived state),
 * so this row deliberately omits `actions` rather than wiring a menu button
 * to three items that would do nothing when selected (a live stub, per
 * implementation-rules.md's "never leave a stub wired to a live control").
 */
export function Resource({
  resource,
  onClick,
  ...entryProps
}: ResourceProps) {
  const isClickable = resource.kind === 'image' && onClick !== undefined;

  return (
    <Entry
      {...entryProps}
      leading={
        <AppIcon
          className="resource__icon"
          icon={getResourceIcon(resource.kind)}
        />
      }
      onClick={isClickable ? () => onClick(resource) : undefined}
    >
      <span className="resource__title">{resource.name}</span>
    </Entry>
  );
}
