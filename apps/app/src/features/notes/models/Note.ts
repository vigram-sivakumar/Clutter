import { Entry } from './Entry';

export interface Note extends Entry {
  title: string;
  type: 'note';
  isFavorite: boolean;
}
