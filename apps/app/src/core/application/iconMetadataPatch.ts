/**
 * Keeps the emoji and image forms of a page/folder icon mutually exclusive
 * on the existing metadata write path.
 *
 * Setting an emoji clears the image; setting an image clears the emoji.
 * Clearing only iconImage preserves the emoji fallback. Clearing icon
 * without an explicit iconImage value removes both, matching the icon
 * picker's Remove action.
 */
export interface IconMetadataPatch {
  readonly icon?: string | null;
  readonly iconImage?: string | null;
}

export function normalizeIconMetadataPatch<T extends object>(
  patch: T & IconMetadataPatch
): T & IconMetadataPatch {
  if (patch.iconImage) {
    return { ...patch, icon: null } as T & IconMetadataPatch;
  }

  if (patch.icon) {
    return { ...patch, iconImage: null } as T & IconMetadataPatch;
  }

  if (patch.icon === null && patch.iconImage === undefined) {
    return { ...patch, iconImage: null } as T & IconMetadataPatch;
  }

  return patch;
}
