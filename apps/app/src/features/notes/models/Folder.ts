import { Entry } from './Entry';

export interface Folder extends Entry {
  title: string;
  type: 'folder';
}
