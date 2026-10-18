import './SpaceAvatar.css';
import { useState } from 'react';
import { AppIcon } from '@shared/icon';

/**
 * How a Space is represented. `initial` derives its letter from the vault
 * folder's name; `image` carries a vault-relative asset path or an http(s) URL
 * (resolved by `resolveImageUrl`); `emoji` is shown as chosen.
 */
export type SpaceAvatarValue =
  | { readonly type: 'initial' }
  | { readonly type: 'image'; readonly src: string }
  | { readonly type: 'emoji'; readonly emoji: string };

/** An avatar the user chose (emoji or image); `initial` is what a Space has when nothing is chosen. */
export type SpaceAvatarChoice = Exclude<SpaceAvatarValue, { readonly type: 'initial' }>;

export interface SpaceAvatarProps {
  avatar: SpaceAvatarValue;
  /** The vault folder's name — the source of the `initial` variant, and the fallback for the other two. */
  folderName: string;
  /**
   * Turns an `image` avatar's `src` into a loadable URL; `null` means there is
   * nothing to load (the initial is shown instead). Defaults to using `src` as-is.
   */
  resolveImageUrl?(src: string): string | null;
}

const identity = (src: string): string => src;

function firstLetter(name: string): string {
  // Array.from keeps a leading surrogate pair (e.g. an astral letter) whole.
  return Array.from(name.trim())[0]?.toUpperCase() ?? '';
}

function Initial({ folderName }: { folderName: string }) {
  return <div className="space__initial">{firstLetter(folderName)}</div>;
}

function Image({ url, folderName }: { url: string; folderName: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <Initial folderName={folderName} />;
  }

  return <img className="space__avatar" src={url} alt="" onError={() => setFailed(true)} />;
}

export function SpaceAvatar({ avatar, folderName, resolveImageUrl = identity }: SpaceAvatarProps) {
  switch (avatar.type) {
    case 'emoji':
      return avatar.emoji ? <AppIcon emoji={avatar.emoji} /> : <Initial folderName={folderName} />;
    case 'image': {
      const url = resolveImageUrl(avatar.src);
      // Keyed on the URL so a new image gets a fresh load attempt after an earlier failure.
      return url ? (
        <Image key={url} url={url} folderName={folderName} />
      ) : (
        <Initial folderName={folderName} />
      );
    }
    case 'initial':
      return <Initial folderName={folderName} />;
  }
}
