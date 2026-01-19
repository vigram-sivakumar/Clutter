# Known Issues

This document tracks known issues, limitations, and technical debt in Clutter Notes 2.0.

**Last Updated:** January 19, 2026

---

## 🔴 Critical Issues

### 1. No Data Persistence for Notes, Folders, and Tags

**Status:** Open - Top Priority  
**Impact:** Critical - All user data lost on app refresh/restart

**Description:**

- Notes, folders, and tags stores use plain Zustand without persistence middleware
- Data exists only in memory during the current session
- Only UI preferences (sidebar state, theme, ordering) persist to localStorage

**Reproduction:**

1. Create any note, folder, or tag
2. Refresh the app or close and reopen
3. All data is gone

**Workaround:** None - avoid using app for important data

**Fix Plan:**

- Short-term: Add Zustand `persist` middleware to notes, folders, and tags stores
- Long-term: Migrate to SQLite via Tauri backend

**Related Files:**

- `packages/state/src/stores/notes.ts` - No persist middleware
- `packages/state/src/stores/folders.ts` - No persist middleware
- `packages/state/src/stores/tags.ts` - No persist middleware
- `packages/state/src/stores/uiState.ts` - Has persist (example to follow)

---

## 🟡 High Priority Issues

### 2. Daily Note Title Updates Not Automatic

**Status:** Open  
**Impact:** Medium - Daily notes don't update "Today" → "Yesterday" automatically

**Description:**

- `updateDailyNoteTitles()` method exists in notes store
- Not called automatically when date changes (e.g., at midnight)
- Titles like "Today, 18 Jan 2026" don't update to "Yesterday, 18 Jan 2026" the next day

**Workaround:** Restart the app to trigger title updates

**Fix Plan:**

- Add date change detection (check at app startup and periodically)
- Automatically call `updateDailyNoteTitles()` when date changes

**Related Files:**

- `packages/state/src/stores/notes.ts` (lines 404-425) - updateDailyNoteTitles method
- `packages/state/src/stores/currentDate.ts` - Date tracking logic

---

### 3. Multiple Daily Notes Can Exist for Same Date

**Status:** Open  
**Impact:** Medium - Edge case can create duplicate daily notes

**Description:**

- `findDailyNoteByDate()` handles duplicates by returning the latest
- But duplicates can still exist in the database
- Usually happens if timing/race conditions occur during creation

**Reproduction:**
Difficult to reproduce reliably - race condition between checks

**Fix Plan:**

- Add unique constraint when SQLite is implemented
- Add creation lock to prevent concurrent daily note creation

**Related Files:**

- `packages/state/src/stores/notes.ts` (lines 327-348) - findDailyNoteByDate
- `packages/state/src/stores/notes.ts` (lines 350-402) - createDailyNote

---

## 🟢 Medium Priority Issues

### 4. No Conflict Resolution for Deleted Daily Notes

**Status:** By Design (but may need improvement)  
**Impact:** Low - Could confuse users

**Description:**

- When creating a daily note that was previously deleted, the old one is converted to a regular note
- The conversion keeps the note in "Recently deleted"
- Users might be confused why a regular note with today's date appears in deleted items

**Current Behavior:**

1. Delete today's daily note
2. Create today's daily note again
3. Old note becomes a regular note (titled "19 Jan 2026") and stays deleted
4. New daily note is created

**Discussion:**
This is intentional to preserve user data, but UX could be improved with:

- A notification explaining the conversion
- Option to restore or permanently delete the old note

**Related Files:**

- `packages/state/src/stores/notes.ts` (lines 358-386) - Deleted daily note handling

---

### 5. Editor Block IDs May Not Be Universally Unique

**Status:** Open - Low risk currently  
**Impact:** Low - Could affect future collaboration features

**Description:**

- Block IDs use `Date.now() + Math.random()` for uniqueness
- Collision probability is low but non-zero
- Could cause issues when collaboration is implemented

**Fix Plan:**

- Use UUID library for truly unique IDs
- Consider including device/user ID in the generation

**Related Files:**

- `packages/editor/extensions/BlockIdGenerator.ts`

---

### 6. No Data Export/Import

**Status:** Open  
**Impact:** Low currently (since data doesn't persist anyway)

**Description:**

- No way to export notes to JSON, Markdown, or other formats
- No way to import existing notes
- Will be critical once persistence is implemented

**Fix Plan:**

- Add export to JSON (preserves full structure)
- Add export to Markdown (for portability)
- Add import from JSON
- Consider import from other apps (Notion, Obsidian, etc.)

---

## 📋 Technical Debt

### Architectural Exceptions (Tracked in ARCHITECTURAL_EXCEPTIONS.md)

These are documented exceptions to architectural boundaries:

- `TipTapWrapper.tsx` - Should move to apps layer
- `useEditorContext.ts` - Should move to apps layer
- `FloatingToolbar.tsx` - Should move to editor or apps layer

See `packages/ui/ARCHITECTURAL_EXCEPTIONS.md` for details.

---

### Missing Test Coverage

**Areas needing tests:**

- Daily notes creation and date handling
- Deleted daily note conversion logic
- Block ID uniqueness
- Tag and folder operations
- Editor commands and keyboard shortcuts

---

## 🚫 Non-Issues (Won't Fix)

### Data Lost in Development Mode

**Report:** "My notes disappear when I make code changes"  
**Status:** Expected behavior - HMR reloads state

This is expected during development with hot module reload. Once persistence is implemented, data will survive HMR.

---

## 📝 How to Report Issues

If you find a new issue:

1. Check if it's already listed here
2. Create a GitHub issue (if applicable) or add to this file
3. Include:
   - Clear description
   - Reproduction steps
   - Expected vs actual behavior
   - Impact assessment (Critical/High/Medium/Low)

---

## 📚 Related Documents

- `README.md` - User-facing known limitations
- `ARCHITECTURE.md` - Architectural decisions and boundaries
- `DEBUG_BLOCKID_ISSUE.md` - Specific debugging documentation
- `packages/ui/ARCHITECTURAL_EXCEPTIONS.md` - Tracked architectural exceptions
