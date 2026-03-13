import { useState, useEffect } from 'react';
import { Plus } from '../../../../../icons';
import { TagInput } from './TagInput';
import { TagsList } from './TagsList';
import { TertiaryButton } from '../../../../ui-buttons';
import { spacing } from '../../../../../tokens/spacing';
import { sizing } from '../../../../../tokens/sizing';
import { getFadeGradient } from '../../../../../tokens/interactions';
import { useTheme } from '../../../../../hooks/useTheme';

interface TagsProps {
  tags?: string[];
  showTagInput: boolean;
  tagsVisible: boolean;
  onAddTag?: (tag: string) => void;
  onRemoveTag?: (tag: string) => void;
  onShowTagInput?: (e: React.MouseEvent) => void;
  onCancelTagInput?: () => void;
  onToggleVisibility?: () => void;
  onTagClick?: (tag: string) => void;
  backgroundColor?: string;
}

export const Tags = ({
  tags,
  showTagInput,
  tagsVisible,
  onAddTag,
  onRemoveTag,
  onShowTagInput,
  onCancelTagInput,
  onToggleVisibility,
  onTagClick,
  backgroundColor,
}: TagsProps) => {
  const { colors } = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  // Reset hover state when tags become visible
  useEffect(() => {
    if (tagsVisible) {
      setIsHovered(false);
    }
  }, [tagsVisible]);

  // Only show when there are tags or when the input is active
  // The metadata controls "Tag" button handles adding the first tag
  if ((!tags || tags.length === 0) && !showTagInput) {
    return null;
  }

  if (!tagsVisible) {
    return null;
  }

  return (
    <div
      className="layout-tags"
      style={{
        position: 'relative',
        display: 'flex',
        flexWrap: 'wrap',
        gap: spacing['6'],
        alignItems: 'center',
        height: '24px',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {tags.length > 0 && (
        <TagsList
          tags={tags}
          onRemoveTag={onRemoveTag}
          onTagClick={onTagClick}
        />
      )}
      {showTagInput ? (
        <TagInput
          onAddTag={onAddTag}
          existingTags={tags}
          onCancel={onCancelTagInput}
        />
      ) : (
        <TertiaryButton
          icon={<Plus size={sizing.icon.sm} />}
          onMouseDown={onShowTagInput}
          size="xs"
          subtle
          // noHoverBackground
        />
      )}
      {tags.length > 0 && isHovered && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: getFadeGradient(
              backgroundColor || colors.background.default
            ).padding,
            background: getFadeGradient(
              backgroundColor || colors.background.default
            ).background,
          }}
        >
          <TertiaryButton onClick={onToggleVisibility} size="xs" subtle>
            Hide
          </TertiaryButton>
        </div>
      )}
    </div>
  );
};
