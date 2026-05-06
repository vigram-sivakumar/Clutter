import type { HTMLAttributes } from 'react';

import { ICON_EXTRA_LARGE, Icons } from '../../design-system/icons';

export type DocIconType = 'icon' | 'emoji';
export type DocIconState = 'default' | 'hover';
export type DocIconName = keyof typeof Icons;

export interface DocIconProps extends HTMLAttributes<HTMLDivElement> {
  /** Figma variants: `Type=Icon` / `Type=Emoji`. */
  type?: DocIconType;
  /** Figma variants: `State=Default` / `State=Hover`. */
  state?: DocIconState;
  /** Icon key from the centralized design-system registry. */
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
  const IconComponent = icon ? Icons[icon] : Icons.Circle;

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
          <IconComponent size={ICON_EXTRA_LARGE} weight="regular" />
        </span>
      ) : (
        <span className="clutter-doc-icon__emoji" aria-hidden>
          {emoji}
        </span>
      )}
    </div>
  );
}
