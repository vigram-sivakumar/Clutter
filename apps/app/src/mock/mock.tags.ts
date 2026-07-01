import { Icons } from '../design-system/icons';
import { badgeColor } from '../components/Badge';

export const tagsNavigation = [
  { id: 'create-tag', title: 'Create tag', icon: Icons.Plus },
  { id: 'all-tag', title: 'All tag', icon: Icons.Tag },
];

export interface TagData {
  id: string;
  title: string;
  color: badgeColor;
  count: number;
}
export const tagsData: TagData[] = [
  { id: 'work', title: 'Work', color: 'blue', count: 0 },
  { id: 'personal', title: 'Personal', color: 'purple', count: 0 },
  { id: 'design', title: 'Design', color: 'indigo', count: 0 },
  { id: 'development', title: 'Development', color: 'green', count: 0 },
  { id: 'research', title: 'Research', color: 'yellow', count: 12 },
  { id: 'reading', title: 'Reading', color: 'orange', count: 0 },
  { id: 'meeting', title: 'Meetings', color: 'red', count: 0 },
  { id: 'archive', title: 'Archive', color: 'grey', count: 0 },
  { id: 'important', title: 'Important', color: 'dark-grey', count: 0 },
  { id: 'inspiration', title: 'Inspiration', color: 'purple', count: 0 },
];
