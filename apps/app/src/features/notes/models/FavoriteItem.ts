export type FavoriteItem = {
  id: string;
  title: string;
  titleStyle: 'default' | 'placeholder';
  type: 'note' | 'folder';
  emoji: string | null;
};
