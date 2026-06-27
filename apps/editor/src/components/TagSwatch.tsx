import type { CSSProperties } from 'react';

import '../styles/tags-tab.css';

import { type TagColors } from '../design-system/tag-colors';
import { Icons, ICON_LARGE } from '../design-system/icons';

export type TagSwatchProps = {
  colors: TagColors;
};

export function TagSwatch({ colors }: TagSwatchProps) {
  const style = {
    '--tag-swatch-bg': colors.background,
    '--tag-swatch-border': colors.border,
  } as CSSProperties;

  return (
    <span className="tags-tab__swatch" style={style}>
      <Icons.SquareFill size={ICON_LARGE} aria-hidden />
    </span>
  );
}
