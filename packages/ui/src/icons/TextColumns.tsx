import { TextColumns as PhosphorTextColumns } from '@phosphor-icons/react';
import type { IconProps } from './types';

export function TextColumns({ size = 24, color, style, ...props }: IconProps) {
  return (
    <PhosphorTextColumns
      size={size}
      color={color}
      style={style}
      weight="regular"
      {...props}
    />
  );
}
