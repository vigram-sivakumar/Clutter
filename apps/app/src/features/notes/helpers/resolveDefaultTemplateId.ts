import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { Vault } from '@core/vault/models/Vault';
import { toTemplateEntries } from '@features/collection/page/toCollectionPageModel';

/**
 * A folder's stored `defaultTemplateId`, if it still names a usable template, else null.
 *
 * "Usable" is exactly what the From template list offers (`toTemplateEntries`: a visible,
 * non-archived page in the Templates collection), so there is one definition of a valid template.
 * A reference that no longer resolves — deleted, archived — reads as unavailable; no other
 * template is substituted and the stored value is left as it is.
 */
export function resolveDefaultTemplateId(
  vault: Vault,
  membershipSelector: MembershipSelector,
  storedId: string | null
): string | null {
  if (storedId === null) {
    return null;
  }

  const isTemplate = toTemplateEntries(vault, membershipSelector, () => undefined).some(
    (template) => template.id === storedId
  );

  return isTemplate ? storedId : null;
}
