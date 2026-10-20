/**
 * What the Settings pages need from the open Space for the settings that belong to a Space (saved in its
 * `.clutter/workspace.json`, so they follow the Space when its folder is moved or copied): supplied by whoever
 * renders Settings (the sidebar footer), read from the Space that is open at that moment — so switching Space shows
 * that Space's own values.
 */
export interface SpaceSettingsSource {
  /** Where covers go on notes with no saved position. */
  getCoverPosition(): 'side' | 'above';
  setCoverPosition(position: 'side' | 'above'): void;
  /** Whether archived items are deleted after 30 days. Off until turned on. */
  getAutoDeleteArchived(): boolean;
  setAutoDeleteArchived(enabled: boolean): void;
  /** Called when either value changes, here or anywhere else. */
  subscribe(listener: () => void): () => void;
}

/** The values a Space has before anything is chosen; what the controls show when no Space is supplied. */
export const DEFAULT_SPACE_SETTINGS = { coverPosition: 'side', autoDeleteArchived: false } as const;
