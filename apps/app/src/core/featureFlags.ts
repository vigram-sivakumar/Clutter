/**
 * FEATURE FLAGS — features that are implemented but not exposed yet. Flip a value to `true` to
 * turn the feature on. Each flag is read through the helper beside it, at the few places that
 * decide whether the feature exists, never re-decided per call site. Remove a flag (and its
 * branches) once the feature ships.
 *
 * The values are held in a plain object only so a test can exercise both states; application code
 * never writes to it.
 */
export const featureFlags = {
  /**
   * Daily Notes' own collection pages — the Daily Notes page (years), a year's page (months) and a
   * month's page (days) — and the breadcrumb on a Daily Note that opens them. Off: none of those
   * pages can be opened, and a Daily Note shows no breadcrumb, since there is nothing for it to
   * link to.
   */
  dailyNotesCollectionPages: false,
  /**
   * The Assets settings page's "Allow moving assets to folders" toggle. Off: the toggle is not shown, so a Space has no
   * way to turn it on from Settings. Only the setting is behind this flag — the behavior it controls (the Gate's rule,
   * the Move picker, updating references) is not, and works for any Space whose saved setting is on.
   */
  allowMovingAssetsSetting: false,
};

export function isDailyNotesCollectionPagesEnabled(): boolean {
  return featureFlags.dailyNotesCollectionPages;
}

export function isAllowMovingAssetsSettingEnabled(): boolean {
  return featureFlags.allowMovingAssetsSetting;
}
