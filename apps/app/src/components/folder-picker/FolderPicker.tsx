import { useMemo, useState } from 'react';

import type { FolderPickerProps } from './FolderPicker.types';
import { Search } from '@components/search/Search';
import { Entry } from '@components/entry/Entry';
import { Folder } from '@features/notes/sidebar/Folder';
import { AppIcon } from '@shared/icon';

import './FolderPicker.css';

export function FolderPicker({ items, onSelect, onCreate }: FolderPickerProps) {
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) =>
      item.title.toLowerCase().includes(normalizedQuery)
    );
  }, [items, normalizedQuery]);

  const isSearching = normalizedQuery.length > 0;

  return (
    <div className="folder-picker">
      <Search
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search folders"
      />

      <div className="folder-picker__list">
        {filteredItems.map((item) => {
          const displayTitle =
            isSearching && item.ancestorPath
              ? `${item.ancestorPath} / ${item.title}`
              : item.title;

          return (
            <Folder
              key={item.id}
              title={displayTitle}
              emoji={item.emoji ?? undefined}
              level={isSearching ? 0 : item.level}
              onClick={() => onSelect(item)}
            />
          );
        })}

        {isSearching && filteredItems.length === 0 && onCreate && (
          <Entry
            leading={<AppIcon icon="plus" />}
            onClick={() => onCreate(query.trim())}
          >
            {`Create "${query.trim()}"`}
          </Entry>
        )}
      </div>
    </div>
  );
}
