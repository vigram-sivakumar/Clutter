import { useCallback, useMemo, ReactNode } from 'react';
import { useTheme } from '../../../../../hooks/useTheme';
import { Pencil, Trash2, Plus, MoreVertical } from '../../../../../icons';
import { Button, TertiaryButton } from '../../../../ui-buttons';
import { ContextMenu } from '../../../../ui-primitives/ContextMenu';
import {
  shouldShowQuickAdd,
  shouldShowContextMenu,
} from '../config/sidebarConfig';
import { getNoteIcon, getFolderIcon } from '../../../../../utils/itemIcons';

/**
 * useSidebarActions
 * Unified action builder for notes, folders, and tags
 *
 * This hook eliminates the duplication of:
 * - noteActionsCache (350+ lines)
 * - folderActionsCache (350+ lines)
 * - tagActionsCache (100+ lines)
 *
 * Pattern:
 * - Single source of truth for action building
 * - Memoized for performance
 * - Type-safe with config rules
 *
 * Usage:
 * ```ts
 * const noteActions = useSidebarActions({
 *   type: 'note',
 *   items: notes,
 *   handlers: {
 *     onAdd: handleCreateNote,
 *     onRename: handleRenameNote,
 *     onDelete: handleDeleteNote,
 *     onEmojiClick: handleNoteEmojiClick,
 *     onOpenChange: setOpenContextMenuId,
 *   },
 * });
 *
 * // Then in render:
 * <SidebarItemNote actions={noteActions.get(noteId)} />
 * ```
 */

interface ActionHandlers {
  // Create handlers
  onAdd?: (_parentId: string) => void;

  // Edit handlers
  onRename?: (_id: string) => void;
  onDelete?: (_id: string) => void;
  onEmojiClick?: (_id: string, _element: HTMLButtonElement) => void;
  onEmojiDismiss?: (_id: string) => void;

  // Context menu state
  onOpenChange?: (_id: string | null) => void;
}

interface ItemMetadata {
  id: string;
  emoji?: string;
  isSystemFolder?: boolean;
  context?: string;
  // For type-specific metadata
  [key: string]: any;
}

interface UseSidebarActionsProps {
  type: 'note' | 'folder' | 'tag';
  items: ItemMetadata[];
  handlers: ActionHandlers;
}

interface ActionBuilders {
  get: (_id: string) => ReactNode[];
  getQuickAdd: (_id: string) => ReactNode | null;
  getContextMenu: (_id: string) => ReactNode | null;
}

/**
 * Build standardized action menu items
 */
function buildActionMenu(
  _type: 'note' | 'folder' | 'tag',
  id: string,
  metadata: ItemMetadata,
  handlers: ActionHandlers,
  currentIcon: ReactNode,
  _colors: any
): any[] {
  const hasCustomEmoji = !!metadata.emoji;

  return [
    // Edit row: Rename + Emoji Picker
    {
      buttonGroup: [
        <Button
          key="rename"
          variant="tertiary"
          icon={<Pencil size={16} />}
          onClick={(e) => {
            e.stopPropagation();
            handlers.onRename?.(id);
          }}
          size="medium"
          fullWidth
        >
          Rename
        </Button>,
        // Emoji picker button (shows current icon)
        <Button
          key="emoji"
          variant="filled"
          icon={currentIcon}
          onClick={(e) => {
            e.stopPropagation();
            const buttonElement = e.currentTarget as HTMLButtonElement;
            handlers.onEmojiClick?.(id, buttonElement);
          }}
          size="medium"
          style={{
            position: 'relative',
          }}
        >
          {/* Dismiss button (only for custom emojis) */}
          {hasCustomEmoji && (
            <div
              style={{
                position: 'absolute',
                top: '-6px',
                right: '-6px',
                display: 'none', // Shown on hover via CSS
              }}
              className="emoji-dismiss"
              onClick={(e) => {
                e.stopPropagation();
                handlers.onEmojiDismiss?.(id);
              }}
            >
              {/* Dismiss icon would go here */}
            </div>
          )}
        </Button>,
      ],
    },
    { separator: true },
    // Delete
    {
      icon: <Trash2 size={16} />,
      label: 'Delete',
      onClick: () => handlers.onDelete?.(id),
      danger: true,
    },
  ];
}

export function useSidebarActions({
  type,
  items,
  handlers,
}: UseSidebarActionsProps): ActionBuilders {
  const { colors } = useTheme();

  /**
   * Memoized action cache
   * Builds all actions once and caches them
   */
  const actionCache = useMemo(() => {
    const cache = new Map<string, ReactNode[]>();

    items.forEach((item) => {
      const actions: ReactNode[] = [];

      // Check if this item should show actions based on config
      const showQuickAdd = shouldShowQuickAdd(
        type,
        item.context,
        item.isSystemFolder
      );

      const showContextMenu = shouldShowContextMenu(
        type,
        item.context,
        item.isSystemFolder
      );

      // Quick Add button (+ icon)
      if (showQuickAdd && handlers.onAdd) {
        actions.push(
          <TertiaryButton
            key="add"
            icon={<Plus size={16} />}
            onClick={(e) => {
              e.stopPropagation();
              handlers.onAdd?.(item.id);
            }}
            size="xs"
          />
        );
      }

      // Context Menu (⋮ icon)
      if (showContextMenu) {
        // Get current icon for emoji picker button
        const currentIcon =
          type === 'note'
            ? getNoteIcon({
                emoji: item.emoji,
                dailyNoteDate: item.dailyNoteDate,
                hasContent: item.hasContent,
                size: 16,
                color: colors.text.secondary,
              })
            : type === 'folder'
              ? getFolderIcon({
                  folderId: item.id,
                  emoji: item.emoji,
                  isOpen: false,
                  size: 16,
                  color: colors.text.secondary,
                })
              : null;

        actions.push(
          <ContextMenu
            key="more"
            items={buildActionMenu(
              type,
              item.id,
              item,
              handlers,
              currentIcon,
              colors
            )}
            onOpenChange={(isOpen) =>
              handlers.onOpenChange?.(isOpen ? item.id : null)
            }
          >
            <TertiaryButton icon={<MoreVertical size={16} />} size="xs" />
          </ContextMenu>
        );
      }

      cache.set(item.id, actions);
    });

    return cache;
  }, [items, type, handlers, colors]);

  /**
   * Get actions for a specific item
   */
  const get = useCallback(
    (id: string): ReactNode[] => {
      return actionCache.get(id) || [];
    },
    [actionCache]
  );

  /**
   * Get only quick add button (for convenience)
   */
  const getQuickAdd = useCallback(
    (id: string): ReactNode | null => {
      const actions = actionCache.get(id) || [];
      return actions[0] || null;
    },
    [actionCache]
  );

  /**
   * Get only context menu (for convenience)
   */
  const getContextMenu = useCallback(
    (id: string): ReactNode | null => {
      const actions = actionCache.get(id) || [];
      // Context menu is second action if quick add exists, otherwise first
      const item = items.find((i) => i.id === id);
      const hasQuickAdd = item
        ? shouldShowQuickAdd(type, item.context, item.isSystemFolder)
        : false;
      return hasQuickAdd ? actions[1] || null : actions[0] || null;
    },
    [actionCache, items, type]
  );

  return {
    get,
    getQuickAdd,
    getContextMenu,
  };
}

/**
 * Type-specific hooks for convenience
 */

export function useNoteActions(
  notes: ItemMetadata[],
  handlers: ActionHandlers
): ActionBuilders {
  return useSidebarActions({ type: 'note', items: notes, handlers });
}

export function useFolderActions(
  folders: ItemMetadata[],
  handlers: ActionHandlers
): ActionBuilders {
  return useSidebarActions({ type: 'folder', items: folders, handlers });
}

export function useTagActions(
  tags: ItemMetadata[],
  handlers: ActionHandlers
): ActionBuilders {
  return useSidebarActions({ type: 'tag', items: tags, handlers });
}
