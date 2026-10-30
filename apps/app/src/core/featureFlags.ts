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
  /**
   * URL (remote) assets anywhere the Assets catalog is read — the Assets collection pages and the cover picker's Asset
   * tab. Off: `MembershipSelector.getAllAssets` returns vault files only. Only the listing is behind this flag —
   * `AssetCatalogBuilder` still knows how to build remote assets, and the remote-asset rows, card previews, menu and
   * image overlay are untouched, so turning it on restores everything with nothing else to wire.
   */
  remoteAssetsInCatalog: false,
  /**
   * Atomic vault saves (ADR-063): every text write into a vault replaces the file whole through the native writer
   * instead of the fs plugin's truncating in-place write. **On in every build, development and packaged
   * alike: it is the only saving system.** There is no build switch to turn it off and no fallback when an atomic save fails
   * (the failure is reported and the text kept); the plugin writer is still in the repository, unused, until the
   * removal criteria in the ADR are met. It needs the native commands, which the default `atomic-writes` Cargo feature
   * registers; a build without them refuses to open a Space. The value is held here only so a test can exercise the
   * legacy provider; application code never writes to it.
   */
  atomicWrites: true,
};

export function isDailyNotesCollectionPagesEnabled(): boolean {
  return featureFlags.dailyNotesCollectionPages;
}

export function isAtomicWritesEnabled(): boolean {
  return featureFlags.atomicWrites;
}

export function isAllowMovingAssetsSettingEnabled(): boolean {
  return featureFlags.allowMovingAssetsSetting;
}

export function isRemoteAssetsInCatalogEnabled(): boolean {
  return featureFlags.remoteAssetsInCatalog;
}
