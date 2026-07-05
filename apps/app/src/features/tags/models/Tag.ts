import { badgeColor } from '../../../components/badge/Badge';

export interface Tag {
  id: string;
  title: string;
  color: badgeColor;
  isFavorite: boolean;
}
