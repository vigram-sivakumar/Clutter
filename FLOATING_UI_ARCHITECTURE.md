# Floating UI Architecture

This document describes the unified architecture for all floating UI components (menus, dropdowns, toolbars) in the editor.

## Table of Contents

- [Overview](#overview)
- [Component Hierarchy](#component-hierarchy)
- [Component Responsibilities](#component-responsibilities)
- [Usage Patterns](#usage-patterns)
- [Interaction Patterns](#interaction-patterns)
- [Testing](#testing)
- [Migration Guide](#migration-guide)

---

## Overview

The floating UI architecture consists of three layers, each with a single, clear responsibility:

```
┌─────────────────────────────────────────────┐
│  Application Layer                          │
│  (SlashCommandMenu, AtMentionMenu, etc.)   │
│  - Command logic, filtering, data          │
│  - Keyboard navigation state               │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  UI Primitives Layer                        │
│  (DropdownContainer, DropdownItem, etc.)   │
│  - Visual rendering                         │
│  - Shared styling                           │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  Foundation Layer                           │
│  (FloatingMenu, FloatingContainer)         │
│  - Portal rendering                         │
│  - Positioning (fixed)                      │
│  - Dismissal (ESC, click-outside)          │
│  - Scroll locking                           │
└─────────────────────────────────────────────┘
```

**Key Principles:**

1. **Single Responsibility** - Each component has one job
2. **Signal, Don't Decide** - Primitives signal interactions, parents decide behavior
3. **Pure Positioning** - Positioning is separate from interaction logic
4. **Reference Counting** - Scroll locks are managed via reference counting
5. **No Duplicate Handlers** - One handler per interaction type, owned by the correct layer

---

## Component Hierarchy

### Foundation Layer

#### **FloatingContainer**

**Location:** `packages/ui/src/components/ui-primitives/FloatingContainer.tsx`

**Responsibility:** Pure positioning and outside interaction detection

**What it does:**

- Renders content via portal to `document.body`
- Applies `position: fixed` with provided coordinates
- Owns z-index management
- Detects clicks outside the container
- Signals via `onInteractOutside` (does NOT close itself)

**What it does NOT do:**

- Manage scroll locking
- Handle ESC key
- Decide when to close
- Touch DOM outside its tree

```typescript
<FloatingContainer
  isOpen={isOpen}
  position={{ top: 100, left: 50 }}
  onInteractOutside={(e) => console.log('User clicked outside')}
>
  {children}
</FloatingContainer>
```

---

#### **FloatingMenu**

**Location:** `packages/ui/src/components/ui-primitives/FloatingMenu.tsx`

**Responsibility:** Coordination layer for interaction modes

**What it does:**

- Wraps `FloatingContainer`
- Manages scroll locking via `scrollLock.ts`
- Handles ESC key dismissal
- Forwards `onInteractOutside` signals

**What it does NOT do:**

- Render visual UI (delegates to FloatingContainer)
- Handle keyboard navigation (Arrow keys, Enter, Tab)
- Decide z-index or positioning

```typescript
<FloatingMenu
  isOpen={isOpen}
  position={{ top: 100, left: 50 }}
  lockScroll={true}
  dismissOnEscape={true}
  onInteractOutside={handleClose}
>
  {children}
</FloatingMenu>
```

---

#### **scrollLock.ts**

**Location:** `packages/ui/src/utils/scrollLock.ts`

**Responsibility:** Reference-counted scroll locking

**What it does:**

- Locks page scroll when acquired
- Unlocks when all references are released
- Handles two-tier locking (`.scroll-wrapper` then `document.body`)
- Restores scroll position on unlock

**Usage:**

```typescript
// Acquire lock
acquireScrollLock();

// Release lock (when component unmounts)
releaseScrollLock();

// Multiple overlays = multiple locks (reference counted)
```

---

### UI Primitives Layer

#### **DropdownContainer**

**Location:** `packages/ui/src/components/ui-primitives/dropdown/DropdownContainer.tsx`

**Responsibility:** Dropdown wrapper with shared styling

**What it does:**

- Wraps `FloatingMenu`
- Applies dropdown-specific styling (border, shadow, padding)
- Renders scrollbar CSS
- Sets default dimensions (minWidth, maxWidth, maxHeight)

```typescript
<DropdownContainer
  isOpen={isOpen}
  position={{ top: 100, left: 50 }}
  onClose={handleClose}
  dismissOnEscape={true}
  minWidth="240px"
  maxWidth="240px"
  maxHeight="310px"
>
  {children}
</DropdownContainer>
```

---

#### **DropdownItem**

**Location:** `packages/ui/src/components/ui-primitives/dropdown/DropdownItem.tsx`

**Responsibility:** Clickable item within dropdowns

**Features:**

- Icon + label layout
- Hover and selection states
- `scrollMargin` for smooth scroll-into-view
- Three variants: primary, secondary, tertiary
- Optional description, trailing elements, keyboard shortcuts

```typescript
<DropdownItem
  icon={<IconComponent size={16} />}
  label="Command Name"
  isSelected={isSelected}
  onClick={handleClick}
  onMouseEnter={handleHover}
/>
```

---

#### **DropdownHeader**

**Location:** `packages/ui/src/components/ui-primitives/dropdown/DropdownHeader.tsx`

**Responsibility:** Section labels within dropdowns

```typescript
<DropdownHeader label="SECTION NAME" />
```

---

#### **DropdownSeparator**

**Location:** `packages/ui/src/components/ui-primitives/dropdown/DropdownSeparator.tsx`

**Responsibility:** Visual divider between sections

```typescript
<DropdownSeparator />
```

---

## Component Responsibilities

### Clear Ownership Table

| Concern                     | Owner             | Location      |
| --------------------------- | ----------------- | ------------- |
| **Portal rendering**        | FloatingContainer | Foundation    |
| **Fixed positioning**       | FloatingContainer | Foundation    |
| **Z-index**                 | FloatingContainer | Foundation    |
| **Click-outside detection** | FloatingContainer | Foundation    |
| **ESC dismissal**           | FloatingMenu      | Foundation    |
| **Scroll locking**          | FloatingMenu      | Foundation    |
| **Dropdown styling**        | DropdownContainer | UI Primitives |
| **Item styling**            | DropdownItem      | UI Primitives |
| **Arrow key navigation**    | Plugin (editor)   | Application   |
| **Enter/Tab execution**     | Plugin (editor)   | Application   |
| **Command filtering**       | Component         | Application   |
| **State management**        | Component         | Application   |

---

## Usage Patterns

### Pattern 1: Simple Dropdown Menu

```typescript
function MyMenu({ editor }: { editor: Editor }) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleClose = () => {
    setIsOpen(false);
  };

  const items = ['Option 1', 'Option 2', 'Option 3'];

  return (
    <DropdownContainer
      isOpen={isOpen}
      position={position}
      onClose={handleClose}
      dismissOnEscape={true}
      minWidth="200px"
      maxWidth="300px"
      maxHeight="400px"
    >
      {items.map((item, index) => (
        <DropdownItem
          key={item}
          label={item}
          isSelected={index === selectedIndex}
          onClick={() => console.log(`Selected: ${item}`)}
        />
      ))}
    </DropdownContainer>
  );
}
```

---

### Pattern 2: Grouped Dropdown with Sections

```typescript
function GroupedMenu() {
  const groups = {
    'Basic': ['Item 1', 'Item 2'],
    'Advanced': ['Item 3', 'Item 4'],
  };

  return (
    <DropdownContainer {...props}>
      {Object.entries(groups).map(([groupName, items], groupIndex) => (
        <div key={groupName}>
          {/* Add separator before all groups except first */}
          {groupIndex > 0 && <DropdownSeparator />}

          {/* Section header */}
          <DropdownHeader label={groupName} />

          {/* Items in this group */}
          {items.map((item) => (
            <DropdownItem key={item} label={item} {...itemProps} />
          ))}
        </div>
      ))}
    </DropdownContainer>
  );
}
```

---

### Pattern 3: Scroll-into-View for Keyboard Navigation

```typescript
function NavigableMenu() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const items = containerRef.current.querySelectorAll('button');
    const selectedItem = items[selectedIndex];

    if (selectedItem) {
      selectedItem.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [isOpen, selectedIndex]);

  return (
    <DropdownContainer {...props}>
      <div ref={containerRef}>
        {items.map((item, index) => (
          <DropdownItem
            key={item}
            label={item}
            isSelected={index === selectedIndex}
            onClick={() => handleSelect(index)}
          />
        ))}
      </div>
    </DropdownContainer>
  );
}
```

**Note:** `DropdownItem` has `scrollMargin: 4px` built-in, so scrolled items maintain padding from edges.

---

## Interaction Patterns

### ESC Key Dismissal

**Architecture:**

- `FloatingMenu` listens for ESC key on `document`
- Calls `onInteractOutside(KeyboardEvent)` when ESC is pressed
- Parent component decides whether to close

**Best Practice:**

```typescript
const handleClose = () => {
  if (!editor) return;

  const storage = editor.storage.myPlugin;
  storage.isOpen = false;
  storage.userClosed = true; // Prevent auto-reopening
  editor.view.dispatch(editor.view.state.tr);
};

// In component
<DropdownContainer
  onClose={handleClose}
  dismissOnEscape={true} // Enable ESC
/>
```

**Anti-Pattern:** ❌

```typescript
// DON'T add ESC handler in plugin
addKeyboardShortcuts() {
  return {
    Escape: () => {
      // ❌ This duplicates FloatingMenu's ESC handler
      storage.isOpen = false;
      return true;
    }
  };
}
```

---

### Click-Outside Dismissal

**Architecture:**

- `FloatingContainer` listens for `mousedown` events on `document` (capture phase)
- Checks if click target is outside container via `contains()`
- Calls `onInteractOutside(MouseEvent)` if outside

**Best Practice:**

```typescript
// Pass stable callback reference
<DropdownContainer onClose={handleClose} />

// OR use useCallback if transformation needed
const handleClose = useCallback(() => {
  // ... close logic
}, [dependencies]);
```

**Anti-Pattern:** ❌

```typescript
// ❌ Unstable callback causes effect churn
<DropdownContainer onClose={() => handleClose()} />
```

---

### Preventing Auto-Reopen (userClosed Flag)

**Problem:** User closes menu explicitly, but plugin's `view.update()` immediately reopens it.

**Solution:** Use `userClosed` flag in plugin storage.

**Implementation:**

```typescript
// 1. Add to plugin storage
addStorage() {
  return {
    isOpen: false,
    userClosed: false, // Track explicit dismissal
  };
}

// 2. Set flag on close
const handleClose = () => {
  storage.isOpen = false;
  storage.userClosed = true; // Prevent reopen
  editor.view.dispatch(editor.view.state.tr);
};

// 3. Check flag in plugin's view.update()
view() {
  return {
    update(view, prevState) {
      if (shouldOpenMenu) {
        // Don't open if user explicitly closed
        if (!storage.userClosed) {
          storage.isOpen = true;
        }
      } else {
        // Reset flag when trigger is removed
        storage.userClosed = false;
      }
    }
  };
}
```

---

### Scroll Locking

**When to Use:**

- Dropdowns: ✅ Yes (via `DropdownContainer` which enables by default)
- Tooltips: ❌ No
- Floating toolbar: ❌ No (doesn't trap focus)

**Architecture:**

- Reference counted via `scrollLock.ts`
- Multiple overlays = multiple locks
- Last unlock restores scroll

**Automatic Usage:**

```typescript
// DropdownContainer enables scroll locking by default
<DropdownContainer {...props} />
```

**Manual Usage:**

```typescript
import { acquireScrollLock, releaseScrollLock } from '@clutter/ui';

useEffect(() => {
  if (isOpen) {
    acquireScrollLock();
    return () => releaseScrollLock();
  }
}, [isOpen]);
```

---

## Testing

### Automated Tests

**Location:** `packages/ui/src/`

1. **scrollLock.test.ts** - 18 tests
   - Reference counting
   - Two-tier locking
   - Multiple overlays
   - Edge cases

2. **FloatingContainer.test.tsx** - 19 tests
   - Rendering and positioning
   - Click-outside detection
   - Z-index management
   - Edge cases

**Run tests:**

```bash
npm run test:run
```

---

### Manual Testing Checklist

**For any new floating component:**

#### Basic Functionality

- [ ] Opens at correct position
- [ ] Displays content correctly
- [ ] Closes when expected

#### Keyboard Interaction

- [ ] ESC closes the menu
- [ ] After ESC, menu doesn't auto-reopen
- [ ] Arrow keys work (if applicable)
- [ ] Enter/Tab work (if applicable)

#### Mouse Interaction

- [ ] Click outside closes menu
- [ ] After click-outside, menu doesn't auto-reopen
- [ ] Hover works correctly
- [ ] Click on item works

#### Scroll Behavior

- [ ] Page doesn't scroll when menu is open
- [ ] Page scrolls normally after menu closes
- [ ] Keyboard navigation scrolls items into view
- [ ] Items maintain padding from container edges

#### Edge Cases

- [ ] Rapid open/close doesn't break
- [ ] Multiple menus don't conflict
- [ ] Works at viewport edges
- [ ] Works with different content sizes

---

## Migration Guide

### Migrating Existing Components

**Before:**

```typescript
// Old: Custom positioning, manual event handling
const MyMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Manual click-outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // ... manual contains check
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Manual scroll locking
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  // Manual ESC handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div
      style={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        // ... 50+ lines of manual styling
      }}
    >
      {/* Custom styled items */}
    </div>
  );
};
```

**After:**

```typescript
// New: Use shared primitives
const MyMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const handleClose = () => setIsOpen(false);

  return (
    <DropdownContainer
      isOpen={isOpen}
      position={position}
      onClose={handleClose}
      dismissOnEscape={true}
      minWidth="240px"
      maxWidth="240px"
      maxHeight="310px"
    >
      {items.map((item) => (
        <DropdownItem
          key={item.id}
          label={item.label}
          icon={item.icon}
          onClick={() => handleSelect(item)}
        />
      ))}
    </DropdownContainer>
  );
};
```

**Benefits:**

- ~150 lines → ~30 lines
- All interaction modes handled automatically
- Consistent UX across all menus
- Easier to maintain and test

---

### Step-by-Step Migration

1. **Replace container:**
   - Remove custom `<div>` with positioning styles
   - Add `<DropdownContainer>` with position props

2. **Replace items:**
   - Remove custom `<button>` elements
   - Add `<DropdownItem>` components

3. **Remove manual handlers:**
   - Delete click-outside `useEffect`
   - Delete ESC key `useEffect`
   - Delete scroll locking `useEffect`
   - Remove duplicate plugin ESC handlers

4. **Add close handler:**
   - Create `handleClose()` function
   - Pass to `onClose` prop
   - Set `userClosed` flag if using plugins

5. **Enable dismissal:**
   - Add `dismissOnEscape={true}` prop

6. **Test thoroughly:**
   - Run automated tests
   - Complete manual testing checklist

---

## Best Practices

### ✅ Do

1. **Use stable callbacks**

   ```typescript
   <DropdownContainer onClose={handleClose} />
   ```

2. **Set userClosed flag**

   ```typescript
   storage.userClosed = true; // Prevent auto-reopen
   ```

3. **Let UI layer handle dismissal**

   ```typescript
   // Plugin handles navigation only
   ArrowUp: () => {
     storage.selectedIndex--;
   };
   ArrowDown: () => {
     storage.selectedIndex++;
   };
   // FloatingMenu handles ESC
   ```

4. **Use scrollMargin for keyboard nav**

   ```typescript
   // Built into DropdownItem, no action needed
   ```

5. **Add separators between sections**
   ```typescript
   {groupIndex > 0 && <DropdownSeparator />}
   ```

### ❌ Don't

1. **Create unstable callbacks**

   ```typescript
   <DropdownContainer onClose={() => close()} /> // ❌
   ```

2. **Duplicate ESC handlers**

   ```typescript
   // ❌ Don't add ESC in plugin if using FloatingMenu
   Escape: () => {
     storage.isOpen = false;
   };
   ```

3. **Manual scroll locking**

   ```typescript
   // ❌ DropdownContainer handles this
   document.body.style.overflow = 'hidden';
   ```

4. **Hardcode z-index**

   ```typescript
   // ❌ FloatingContainer owns z-index
   zIndex: 9999;
   ```

5. **Query DOM from plugins**
   ```typescript
   // ❌ Plugins should be DOM-agnostic
   const menu = document.querySelector('.menu');
   ```

---

## Future Considerations

### Potential Enhancements

1. **Focus Trapping**
   - For modal-like dropdowns
   - Would live in `FloatingMenu`

2. **Menu Stacking/Priority**
   - For nested dropdowns
   - Z-index coordination

3. **Collision Detection**
   - Auto-flip when near viewport edges
   - Would extend `FloatingContainer` positioning

4. **Animation**
   - Enter/exit animations
   - Would use CSS transitions in primitives

5. **Virtual Scrolling**
   - For very long lists
   - Would be a variant of `DropdownContainer`

---

## Related Documentation

- [FLOATING_UI_TESTS.md](./FLOATING_UI_TESTS.md) - Test coverage and manual testing checklist
- [DEV_SETUP.md](./DEV_SETUP.md) - Development environment setup
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall system architecture

---

## Change Log

**2026-01-20** - Initial unified architecture documentation

- SlashCommandMenu migrated to shared primitives
- AtMentionMenu ESC handlers cleaned up
- Comprehensive testing suite established
