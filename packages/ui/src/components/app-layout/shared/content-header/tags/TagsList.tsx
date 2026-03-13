import { TagPill } from './Tag';

interface TagsListProps {
  tags: string[];
  onRemoveTag: (tag: string) => void;
  onTagClick?: (tag: string) => void;
}

export const TagsList = ({ tags, onRemoveTag, onTagClick }: TagsListProps) => {
  if (tags.length === 0) return null;

  return (
    <>
      {tags.map((tag) => (
        <TagPill
          key={tag}
          label={tag}
          onRemove={() => onRemoveTag(tag)}
          onClick={onTagClick}
        />
      ))}
    </>
  );
};
