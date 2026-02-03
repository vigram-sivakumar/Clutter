import { Sticker as PhosphorSticker } from '@phosphor-icons/react';
import type { IconProps } from './types';

export function Sticker({ size = 24, color, style, ...props }: IconProps) {
  return (
    <PhosphorSticker
      size={size}
      color={color}
      style={style}
      weight="regular"
      {...props}
    />
  );
}
