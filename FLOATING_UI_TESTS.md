# Floating UI Test Coverage

Automated test suite for the floating UI architecture refactor.

## Test Summary

**Total Tests:** 73 (all passing ✅)

### New Tests Added

#### 1. `scrollLock.test.ts` - 18 tests

Tests the reference-counted scroll lock utility:

**Reference Counting (4 tests)**

- ✅ Starts with count of 0
- ✅ Increments on acquire
- ✅ Decrements on release
- ✅ Never goes below 0

**Scroll Locking with .scroll-wrapper (5 tests)**

- ✅ Locks scroll on first acquire
- ✅ Preserves scroll position
- ✅ Doesn't lock again if already locked
- ✅ Restores scroll when count reaches 0
- ✅ Doesn't restore while count > 0

**Fallback to document.body (3 tests)**

- ✅ Locks body when scroll-wrapper not found
- ✅ Saves scroll position in body top style
- ✅ Restores body scroll on release

**Multiple Overlays (1 test)**

- ✅ Handles multiple overlays correctly (reference counting)

**Reset Functionality (2 tests)**

- ✅ Resets count to 0
- ✅ Restores scroll state

**Edge Cases (3 tests)**

- ✅ Handles rapid acquire/release cycles
- ✅ Handles release without acquire gracefully
- ✅ Handles missing DOM elements gracefully

---

#### 2. `FloatingContainer.test.tsx` - 19 tests

Tests the portal rendering and positioning primitive:

**Rendering (4 tests)**

- ✅ Doesn't render when isOpen is false
- ✅ Renders children when isOpen is true
- ✅ Renders via portal to document.body
- ✅ Applies className prop

**Positioning (6 tests)**

- ✅ Applies fixed positioning
- ✅ Applies top and left position
- ✅ Applies bottom and left position
- ✅ Applies right position
- ✅ Applies transform
- ✅ Applies z-index from sizing tokens

**Click-Outside Detection (6 tests)**

- ✅ Calls onInteractOutside when clicking outside
- ✅ Doesn't call onInteractOutside when clicking inside
- ✅ No listener if onInteractOutside not provided
- ✅ No listener if isOpen is false
- ✅ Uses capture phase for event listener
- ✅ Cleanups listener on unmount

**Edge Cases (3 tests)**

- ✅ Handles SSR (no document)
- ✅ Handles position updates
- ✅ Handles toggling isOpen

---

## Running Tests

```bash
# Run all tests
npm run test:run

# Run specific test file
npm run test:run packages/ui/src/utils/scrollLock.test.ts
npm run test:run packages/ui/src/components/ui-primitives/FloatingContainer.test.tsx

# Run tests in watch mode
npm run test

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage
```

---

## What's Tested

### ✅ Covered by Automated Tests

- Scroll lock reference counting logic
- Scroll lock cleanup and restoration
- Multiple overlays (nested scroll locks)
- Portal rendering to document.body
- Fixed positioning (top, bottom, left, right, transform)
- Z-index application
- Click-outside detection (capture phase)
- Event listener cleanup
- Edge cases (SSR, rapid toggling, missing DOM elements)

### 🧪 Requires Manual Testing

- Visual positioning accuracy
- Smooth animations and transitions
- UX feel (responsiveness, timing)
- Keyboard navigation within menus
- ESC key dismissal (end-to-end)
- Cross-browser compatibility
- Interaction between multiple menus
- Screen reader compatibility
- Mobile/touch interactions

---

## Manual Test Checklist

When testing `AtMentionMenu` (or other floating menus):

### Basic Functionality

- [ ] Type `@` - menu appears below cursor
- [ ] Menu has proper styling (colors, shadows, borders)
- [ ] Menu content is readable and properly formatted
- [ ] Click menu item - inserts correctly and menu closes

### Scroll Lock

- [ ] With menu open, try to scroll page (should be locked)
- [ ] Close menu - scroll should unlock
- [ ] Open menu, close with click-outside - scroll unlocks
- [ ] Open menu, close with ESC - scroll unlocks
- [ ] Open 2 menus (if possible) - scroll stays locked until both closed

### Click-Outside

- [ ] Click outside menu - menu closes
- [ ] Click rapidly outside multiple times - no errors
- [ ] Click inside menu - stays open

### ESC Key

- [ ] Press ESC with menu open - menu closes
- [ ] Press ESC after closing - doesn't reopen
- [ ] Type `@` again after ESC - menu opens fresh

### Positioning

- [ ] Menu appears below @ symbol
- [ ] If near bottom of screen, flips above
- [ ] If near right edge, doesn't overflow
- [ ] Scroll editor - menu position updates correctly

### Edge Cases

- [ ] Type `@`, immediately click away - closes cleanly
- [ ] Type `@`, immediately press ESC - closes cleanly
- [ ] Type `@`, delete it - menu closes
- [ ] Type multiple `@` symbols quickly - no duplicates
- [ ] Resize window with menu open - repositions correctly

---

## Coverage Gaps

If you want to add more tests, consider:

1. **FloatingMenu.test.tsx** - Integration tests for:
   - ESC key handling integration with onInteractOutside
   - Scroll lock integration (acquireScrollLock/releaseScrollLock calls)
   - Props passing to FloatingContainer

2. **DropdownContainer.test.tsx** - Tests for:
   - Styling application (colors, padding, shadows)
   - Size constraints (minWidth, maxWidth, maxHeight)
   - dismissOnEscape prop

3. **Integration tests** - End-to-end tests for:
   - AtMentionMenu full flow (type @ → select item → insert)
   - userClosed flag preventing auto-reopening
   - Plugin interaction with menu component

---

## Test Infrastructure

- **Framework:** Vitest
- **Environment:** happy-dom (browser-like)
- **React Testing:** @testing-library/react
- **Assertions:** Vitest expect (Jest-compatible)
- **Pre-commit:** Tests run automatically before each commit

---

## Next Steps

1. ✅ **Automated tests complete** - 73 tests passing
2. 🔄 **Manual testing** - Run through checklist above
3. 📝 **Document findings** - Note any UX issues
4. 🎯 **Fix issues** - Address any bugs found
5. 🚀 **Migrate remaining menus** - SlashCommandMenu, FloatingToolbar

---

## Notes

- All tests use mocked DOM (happy-dom), not a real browser
- Visual and UX testing must be done manually in the app
- Consider adding Playwright/Cypress for E2E tests if this becomes critical
