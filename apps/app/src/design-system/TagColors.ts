export type TagPaletteId =
  | 'blue'
  | 'green'
  | 'yellow'
  | 'purple'
  | 'red'
  | 'grey'
  | 'dark-grey'
  | 'indigo'
  | 'orange';

export type TagColors = {
  background: string;
  border: string;
};

export function tagColorsFromPalette(palette: TagPaletteId): TagColors {
  return {
    background: `var(--tag-${palette}-bg)`,
    border: 'red',
  };
}
