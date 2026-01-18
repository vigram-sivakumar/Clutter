# Task Variant Implementation Guide

## Overview

This document outlines the implementation of a new `'task'` variant for the `SidebarItem` component, enabling tasks to be selectable sidebar items with multi-select support.

## Design Decisions

### UX Changes
- **Before**: Click task text → Navigate to note
- **After**: 
  - Click task → Select task (enables multi-select)
  - Click checkbox → Toggle completion
  - Click navigate icon (on hover) → Navigate to note and scroll to block

### Icon Choice
Using **ArrowBendDownRight** from Phosphor Icons for the navigation action (jumps down into the note).

## Component Structure

```
AppSidebar
  └─ TasksView
      ├─ SidebarSection (Daily Notes)
      │   └─ SidebarItemNote (variant='note')
      │       └─ SidebarItem
      │
      └─ SidebarSection (All Tasks)
          └─ SidebarItemTask (variant='task') ← NEW!
              └─ SidebarItem
                  ├─ Checkbox (leading control)
                  ├─ Task text with strikethrough
                  └─ Actions
                      ├─ ArrowBendDownRight icon (hover, navigate to note)
                      └─ Context menu
```

## Visual Layout

```
Task Item Structure:
┌────────────────────────────────────────────────────┐
│ ┌──┐ ┌─────────────────────┐ ┌───┐ ┌───┐         │
│ │☑ │ │Buy milk and eggs   │ │↘  │ │⋮ │         │
│ └──┘ └─────────────────────┘ └───┘ └───┘         │
│  ↑            ↑                 ↑      ↑           │
│  │            │                 │      └─ Context menu (⋮)
│  │            │                 └─ Navigate icon (ArrowBendDownRight)
│  │            └─ Task text (strikethrough if checked)
│  └─ Checkbox (toggle completion)
└────────────────────────────────────────────────────┘
```

## Implementation Steps

### 1. Update Type Definitions

**File**: `packages/ui/src/components/app-layout/layout/sidebar/items/SidebarItem.tsx`

```typescript
// Update variant type
type SidebarItemVariant = 'note' | 'folder' | 'tag' | 'header' | 'task';

interface SidebarItemProps {
  // ... existing props
  
  // Task-specific props (NEW!)
  isTaskChecked?: boolean;
  onTaskToggle?: (id: string) => void;
  taskNoteId?: string;
  onTaskNavigate?: (noteId: string, blockId: string) => void;
}
```

### 2. Add Checkbox Rendering

**File**: `packages/ui/src/components/app-layout/layout/sidebar/items/SidebarItem.tsx`

In the `renderIconOrCheckbox()` function, add:

```typescript
if (variant === 'task') {
  return (
    <input
      type="checkbox"
      checked={isTaskChecked || false}
      onChange={(e) => {
        e.stopPropagation();
        if (onTaskToggle) {
          onTaskToggle(id);
        }
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
      style={{
        width: 16,
        height: 16,
        margin: 0,
        flexShrink: 0,
        cursor: 'pointer',
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        border: `1.5px solid ${colors.border.default}`,
        borderRadius: globalSizing.radius.sm,
        backgroundColor: 'transparent',
        transition: 'border-color 0.15s ease',
        outline: 'none',
        backgroundImage: isTaskChecked
          ? `url("data:image/svg+xml,%3Csvg viewBox='0 0 16 16' fill='${colors.text.default.replace('#', '%23')}' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3E%3C/svg%3E")`
          : 'none',
        backgroundSize: '14px 14px',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    />
  );
}
```

### 3. Add Task Label Rendering

**File**: `packages/ui/src/components/app-layout/layout/sidebar/items/SidebarItem.tsx`

In the `renderLabel()` function, add:

```typescript
if (variant === 'task') {
  return (
    <span
      style={{
        fontSize: DESIGN.typography.fontSize,
        fontWeight: DESIGN.typography.fontWeight,
        color: isTaskChecked 
          ? colors.text.tertiary 
          : (isSelected ? colors.text.default : colors.text.secondary),
        textDecoration: isTaskChecked ? 'line-through' : 'none',
        flex: '1 1 0',
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {label}
    </span>
  );
}
```

### 4. Create SidebarItemTask Wrapper

**File**: `packages/ui/src/components/app-layout/layout/sidebar/items/TaskItem.tsx` (NEW)

```typescript
import { ReactNode } from 'react';
import { SidebarItem } from './SidebarItem';
import { TertiaryButton } from '../../../../ui-buttons';
import { ArrowBendDownRight } from '../../../../../icons';

interface SidebarItemTaskProps {
  // Identity
  id: string; // Task/block ID
  noteId: string; // Parent note ID
  noteTitle?: string; // Parent note title (for tooltip)
  
  // Content
  text: string; // Task text content
  checked: boolean; // Completion state
  
  // State
  isSelected?: boolean;
  hasOpenContextMenu?: boolean;
  
  // Interactions
  onClick: (event?: React.MouseEvent) => void;
  onToggle: (taskId: string) => void;
  onNavigate: (noteId: string, blockId: string) => void;
  
  // Actions (context menu items)
  actions?: ReactNode[];
}

export const SidebarItemTask = ({
  id,
  noteId,
  noteTitle,
  text,
  checked,
  isSelected = false,
  hasOpenContextMenu = false,
  onClick,
  onToggle,
  onNavigate,
  actions = [],
}: SidebarItemTaskProps) => {
  // Build navigate action (shown on hover)
  const navigateAction = (
    <TertiaryButton
      icon={<ArrowBendDownRight size={14} />}
      onClick={(e) => {
        e.stopPropagation();
        onNavigate(noteId, id);
      }}
      size="xs"
      tooltip={noteTitle ? `Open in "${noteTitle}"` : 'Open in note'}
    />
  );

  return (
    <SidebarItem
      variant="task"
      id={id}
      label={text}
      isSelected={isSelected}
      hasOpenContextMenu={hasOpenContextMenu}
      onClick={onClick}
      isTaskChecked={checked}
      onTaskToggle={onToggle}
      taskNoteId={noteId}
      onTaskNavigate={onNavigate}
      actions={[navigateAction, ...actions]}
      level={1} // Tasks are always indented one level
      // No drag/drop, rename, or emoji picker for tasks
    />
  );
};
```

### 5. Export the New Component

**File**: `packages/ui/src/components/app-layout/layout/sidebar/items/index.ts`

```typescript
export { SidebarItemTask } from './TaskItem';
```

### 6. Update TasksView to Use New Component

**File**: `packages/ui/src/components/app-layout/layout/sidebar/views/TasksView.tsx`

Add new props to interface:

```typescript
interface SidebarTasksViewProps {
  // ... existing props
  
  // Multi-select (NEW!)
  selectedTaskIds?: Set<string>;
  onTaskMultiSelect?: (taskId: string, event?: React.MouseEvent, context?: string) => void;
  
  // Task actions (NEW!)
  getTaskActions?: (taskId: string) => ReactNode[];
}
```

Replace `TaskItem` usage with `SidebarItemTask`:

```typescript
import { SidebarItemTask } from '../items/TaskItem';

// In the render section:
{incompleteTasks.map(task => (
  <SidebarItemTask
    key={task.id}
    id={task.id}
    noteId={task.noteId}
    noteTitle={task.noteTitle}
    text={task.text}
    checked={task.checked}
    isSelected={
      selection.type === 'task' && 
      selectedTaskIds?.has(task.id) &&
      selection.context === 'allTasks'
    }
    hasOpenContextMenu={openContextMenuId === task.id}
    onClick={(e) => onTaskMultiSelect?.(task.id, e, 'allTasks')}
    onToggle={handleToggleTask}
    onNavigate={(noteId, blockId) => onTaskClick?.(noteId, blockId)}
    actions={getTaskActions ? getTaskActions(task.id) : []}
  />
))}

{completedTasks.map(task => (
  <SidebarItemTask
    key={task.id}
    id={task.id}
    noteId={task.noteId}
    noteTitle={task.noteTitle}
    text={task.text}
    checked={task.checked}
    isSelected={
      selection.type === 'task' && 
      selectedTaskIds?.has(task.id) &&
      selection.context === 'allTasks'
    }
    hasOpenContextMenu={openContextMenuId === task.id}
    onClick={(e) => onTaskMultiSelect?.(task.id, e, 'allTasks')}
    onToggle={handleToggleTask}
    onNavigate={(noteId, blockId) => onTaskClick?.(noteId, blockId)}
    actions={getTaskActions ? getTaskActions(task.id) : []}
  />
))}
```

Remove the old `TaskItem` component definition (lines 154-238).

### 7. Add Multi-Select Support in AppSidebar

**File**: `packages/ui/src/components/app-layout/layout/sidebar/AppSidebar.tsx`

Add helper to extract tasks:

```typescript
// Import at top
import type { Task } from './views/TasksView';

// Helper to extract tasks from notes (move from TasksView)
const extractTasksFromNote = (note: Note): Task[] => {
  try {
    const parsed = JSON.parse(note.content);
    const tasks: Task[] = [];
    
    const traverseNodes = (node: any) => {
      if (node.type === 'listBlock' && node.attrs?.listType === 'task') {
        let text = '';
        if (node.content && Array.isArray(node.content)) {
          text = node.content
            .map((child: any) => {
              if (child.type === 'text') {
                return child.text || '';
              }
              return '';
            })
            .join('');
        }
        
        if (text.trim()) {
          tasks.push({
            id: node.attrs.blockId || crypto.randomUUID(),
            text: text.trim(),
            checked: node.attrs.checked || false,
            noteId: note.id,
            noteTitle: note.title || 'Untitled',
            noteEmoji: note.emoji,
          });
        }
      }
      
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach(traverseNodes);
      }
    };
    
    if (parsed.type === 'doc' && parsed.content) {
      parsed.content.forEach(traverseNodes);
    }
    
    return tasks;
  } catch {
    return [];
  }
};
```

Add multi-select hook for tasks:

```typescript
// Build flat list of all visible tasks for multi-select
const visibleTasks = useMemo(() => {
  const activeNotes = notes.filter((n: Note) => !n.deletedAt);
  const tasks: Task[] = [];
  
  activeNotes.forEach(note => {
    const noteTasks = extractTasksFromNote(note);
    tasks.push(...noteTasks);
  });
  
  return tasks;
}, [notes]);

// Use multi-select hook for tasks
const {
  selectedIds: selectedTaskIds,
  lastClickedId: lastClickedTaskId,
  handleClick: handleTaskMultiSelectBase,
  clearSelection: clearTaskSelection,
} = useMultiSelect({
  items: visibleTasks,
  getItemId: (task) => task.id,
  onSingleSelect: (taskId) => {
    // Optional: single click behavior
  },
});

// Track the last task click context for selection state
const lastTaskContextRef = useRef<string | null>(null);

const handleTaskMultiSelect = useCallback((taskId: string, event?: React.MouseEvent, context?: string) => {
  // Clear note/folder selection when selecting tasks
  clearNoteSelection();
  clearFolderSelection();
  // Store context for the effect to use
  lastTaskContextRef.current = context || null;
  handleTaskMultiSelectBase(taskId, event);
}, [handleTaskMultiSelectBase, clearNoteSelection, clearFolderSelection]);

// Sync selection state when selectedTaskIds changes
useEffect(() => {
  if (selectedTaskIds.size > 0 && lastClickedTaskId) {
    setSelection({
      type: 'task',
      itemId: lastClickedTaskId,
      context: lastTaskContextRef.current,
      multiSelectIds: selectedTaskIds,
    });
  }
}, [selectedTaskIds, lastClickedTaskId]);
```

Update TasksView usage:

```typescript
{contentType === 'tasks' && (
  <TasksView
    // ... existing props
    selectedTaskIds={selectedTaskIds}
    onTaskMultiSelect={handleTaskMultiSelect}
    getTaskActions={getTaskActions} // You'll need to create this
  />
)}
```

Also update the clear selection handler:

```typescript
const handleClearSelection = useCallback(() => {
  clearNoteSelection();
  clearFolderSelection();
  clearTaskSelection(); // Add this
  setSelection({
    type: null,
    itemId: null,
    context: null,
    multiSelectIds: new Set(),
  });
}, [clearNoteSelection, clearFolderSelection, clearTaskSelection, setSelection]);
```

### 8. Update Type Definitions

**File**: `packages/ui/src/components/app-layout/layout/sidebar/types.ts`

```typescript
export interface GlobalSelection {
  /** Type of item selected */
  type: 'note' | 'folder' | 'tag' | 'task' | null; // Added 'task'
  
  /** Primary selected item ID */
  itemId: string | null;
  
  /** Context where the item was selected */
  context: string | null;
  
  /** Multi-select IDs (for notes, folders, and tasks) */
  multiSelectIds?: Set<string>;
}
```

### 9. Export Task Type

**File**: `packages/ui/src/components/app-layout/layout/sidebar/views/TasksView.tsx`

Make the Task interface exportable:

```typescript
export interface Task {
  id: string;
  text: string;
  checked: boolean;
  noteId: string;
  noteTitle: string;
  noteEmoji: string | null;
}
```

## Features Enabled

### Multi-Select Support
- ✅ Cmd/Ctrl + Click to toggle individual task selection
- ✅ Shift + Click for range selection
- ✅ Visual feedback for selected tasks
- ✅ Bulk operations on selected tasks (future: mark complete, delete, etc.)

### Consistent UX
- ✅ All sidebar items (notes, folders, tags, tasks) now have the same interaction model
- ✅ Click to select
- ✅ Leading control for special actions (emoji picker, checkbox)
- ✅ Hover actions for quick operations

### Future Extensions
With tasks as proper sidebar items, future features become easy:
- Task priorities (badge)
- Task due dates (show in label)
- Task tags (show in label)
- Nested sub-tasks (chevron toggle)
- Drag & drop to reorder
- Drag & drop to move between notes

## Testing Checklist

- [ ] Tasks render correctly in sidebar
- [ ] Checkbox toggles task completion
- [ ] Clicking task selects it (highlights)
- [ ] Cmd+Click toggles individual selection
- [ ] Shift+Click selects range
- [ ] ArrowBendDownRight icon shows on hover
- [ ] Clicking navigate icon opens note and scrolls to block
- [ ] Completed tasks show strikethrough
- [ ] Multi-select works across incomplete and completed sections
- [ ] Selection clears when switching tabs
- [ ] Selection clears when clicking empty space
- [ ] Context menu works on tasks (if implemented)

## Estimated Effort

- **Type updates**: 15 min
- **SidebarItem checkbox/label rendering**: 30 min
- **SidebarItemTask wrapper**: 30 min
- **TasksView refactor**: 45 min
- **AppSidebar multi-select integration**: 45 min
- **Testing & polish**: 30 min

**Total**: ~3 hours

## Dependencies

- ✅ ArrowBendDownRight icon (already created)
- ✅ useMultiSelect hook (already exists)
- ✅ SidebarItem component (already exists)
- ✅ TertiaryButton component (already exists)

