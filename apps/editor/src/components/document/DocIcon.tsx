import type { HTMLAttributes } from 'react';

import { CustomIcons, ICON_EXTRA_LARGE } from '../../design-system/icons';

export type DocIconType = 'icon' | 'emoji';
export type DocIconState = 'default' | 'hover';
export type DocIconName = keyof typeof CustomIcons;

export interface DocIconProps extends HTMLAttributes<HTMLDivElement> {
  /** Figma variants: `Type=Icon` / `Type=Emoji`. */
  type?: DocIconType;
  /** Figma variants: `State=Default` / `State=Hover`. */
  state?: DocIconState;
  /** Icon key from {@link CustomIcons}. */
  icon?: DocIconName;
  /** Emoji glyph used for `type="emoji"`; defaults to Figma base value. */
  emoji?: string;
}

/**
 * Document icon base (Figma: `Document/_Icon base`, node `423:20449`).
 */
export function DocIcon({
  type = 'icon',
  state = 'default',
  icon,
  emoji = '🍉',
  className,
  ...props
}: DocIconProps) {
  const IconComponent = icon ? CustomIcons[icon] : CustomIcons.Square;

  const cls = [
    'clutter-doc-icon',
    type === 'icon' ? 'clutter-doc-icon--icon' : 'clutter-doc-icon--emoji',
    state === 'hover' && 'clutter-doc-icon--hover',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} {...props}>
      {type === 'icon' ? (
        <span className="clutter-doc-icon__icon" aria-hidden>
          <IconComponent size={ICON_EXTRA_LARGE} />
        </span>
      ) : (
        <span className="clutter-doc-icon__emoji" aria-hidden>
          {emoji}
        </span>
      )}
    </div>
  );
}
