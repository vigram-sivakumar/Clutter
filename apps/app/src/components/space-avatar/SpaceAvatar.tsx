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
  /**
   * A status mark over the avatar's top-right corner. `error` is the red exclamation badge: something is
   * wrong with the Space itself (its folder is missing), not with the avatar. Absent: the avatar is drawn
   * exactly as before, with no wrapper around it.
   */
  badge?: 'error';
  /** What the badge means, for assistive technology and hover (e.g. "Folder not found"). */
  badgeLabel?: string;
}

const identity = (src: string): string => src;

function firstLetter(name: string): string {
  // Array.from keeps a leading surrogate pair (e.g. an astral letter) whole.
  return Array.from(name.trim())[0]?.toUpperCase() ?? '';
}

function Initial({ folderName }: { folderName: string }) {
  return <div className="space__initial">{firstLetter(folderName)}</div>;
}

/** A PNG can carry its own transparent edge and shape, which the avatar's inset border would outline: it gets none. */
const isPng = (src: string) => /\.png$/i.test(src.split(/[?#]/)[0] ?? '');

function Image({ url, folderName, bordered }: { url: string; folderName: string; bordered: boolean }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <Initial folderName={folderName} />;
  }

  return <img className={bordered ? 'space__avatar' : 'space__avatar space__avatar--borderless'} src={url} alt="" onError={() => setFailed(true)} />;
}

function Avatar({ avatar, folderName, resolveImageUrl = identity }: SpaceAvatarProps) {
  switch (avatar.type) {
    case 'emoji':
      return avatar.emoji ? <AppIcon emoji={avatar.emoji} /> : <Initial folderName={folderName} />;
    case 'image': {
      const url = resolveImageUrl(avatar.src);
      // Keyed on the URL so a new image gets a fresh load attempt after an earlier failure.
      return url ? (
        <Image key={url} url={url} folderName={folderName} bordered={!isPng(avatar.src)} />
      ) : (
        <Initial folderName={folderName} />
      );
    }
    case 'initial':
      return <Initial folderName={folderName} />;
  }
}

export function SpaceAvatar({ badge, badgeLabel, ...avatarProps }: SpaceAvatarProps) {
  if (!badge) {
    return <Avatar {...avatarProps} />;
  }

  return (
    <span className="space__badged">
      <Avatar {...avatarProps} />
      <span
        className={`space__badge space__badge--${badge}`}
        role="img"
        aria-label={badgeLabel}
        title={badgeLabel}
      >
        <AppIcon icon="exclamationMark" size={10} strokeWidth={1.6} />
      </span>
    </span>
  );
}
