# Step 7A: Dual-Read Mode - COMPLETE ✅

**Status:** ✅ Migration Wired at Read Boundary - Ready for Validation

**Impact:** 🎯 Zero-risk validation with real documents

## What Was Built

### Feature Flag System

**Flags Added:**

- ✅ `USE_LEXICAL_EDITOR` - Main switchover flag
- ✅ `SHADOW_RENDER_MODE` - Validation mode (both editors visible)
- ✅ Console helpers - `enableLexicalEditor()`, `disableLexicalEditor()`
- ✅ LocalStorage control - Toggle without code changes
- ✅ Environment variable support - Production rollout

**Where:** `packages/editor/config/featureFlags.ts`

### Migration Integration

**Read Boundary:** `TipTapWrapper.tsx` line ~260

**Flow:**

```
1. PM JSON comes in as `value` prop (string)
   ↓
2. Parse to PM document object
   ↓
3. ✨ NEW: Check USE_LEXICAL_EDITOR flag
   ↓
4. If true: migrateDocument(pmDoc)
   ↓
5. Log result (success/errors)
   ↓
6. PM editor still renders (Step 7B will use blocks)
```

**Key Properties:**

- ✅ **Non-destructive** - PM JSON untouched
- ✅ **Fail-safe** - Errors logged, PM editor continues
- ✅ **Validated** - Tree validation on every migration
- ✅ **Observable** - Console logs show migration results

## How It Works

### Feature Flag Priority

```typescript
1. Check localStorage['USE_LEXICAL_EDITOR']
   ↓ If 'true' → Lexical mode
   ↓ If not set ↓
2. Check process.env.REACT_APP_USE_LEXICAL_EDITOR
   ↓ If 'true' → Lexical mode
   ↓ If not set ↓
3. Default: false → ProseMirror mode
```

**This allows:**

- Dev testing via localStorage (no rebuild)
- Production rollout via environment variable
- Default safe (ProseMirror)

### Migration at Read

**Code in TipTapWrapper:**

```typescript
// Parse incoming value into content object
let incomingContent: object | null = null;
if (value) {
  try {
    incomingContent = JSON.parse(value);
  } catch (jsonError) {
    // Fallback to HTML parsing
  }
}

// 🔧 STEP 7A: Dual-Read Mode
if (USE_LEXICAL_EDITOR && incomingContent) {
  try {
    const migrationResult = migrateDocument(incomingContent as PMDocument, {
      preserveBlockIds: true,
      validateTree: true,
    });

    if (migrationResult.success) {
      console.log('[Migration] ✅ Blocks:', migrationResult.blocks.length);
      // TODO: Pass blocks to Lexical editor (Step 7B)
    } else {
      console.error('[Migration] ❌ Failed:', migrationResult.errors);
      // Fallback to PM editor
    }
  } catch (error) {
    console.error('[Migration] ❌ Exception:', error);
    // Fallback to PM editor
  }
}
```

**Critical: PM JSON remains source of truth**

- ✅ No writes to blocks yet
- ✅ onChange still saves PM JSON
- ✅ Full rollback capability

### What Happens Now

**When flag is OFF (default):**

```
PM JSON → Parse → EditorCore (ProseMirror) → Render
```

**When flag is ON (via localStorage):**

```
PM JSON → Parse → ✨ Migrate → Log blocks → EditorCore (PM) → Render
                    ↓
              Blocks ready for Step 7B
```

**Why this is safe:**

1. Migration happens in read path only
2. Errors don't break editor (fallback to PM)
3. PM JSON never modified
4. Full observability via console
5. Toggle anytime without data loss

## Testing Guide

### Enable Lexical Mode

**In browser console:**

```javascript
// Enable Lexical editor
enableLexicalEditor();
// Logs: "✅ Lexical editor enabled. Reload page to apply."

// Reload page
location.reload();
```

### Watch Migration in Action

**After reload:**

1. Open console
2. Open any note
3. Watch for migration logs:

```
[Migration] ✅ Migrated to blocks: 15
```

Or if errors:

```
[Migration] ❌ Migration failed: [...]
```

### Disable Lexical Mode (Rollback)

```javascript
// Disable Lexical editor
disableLexicalEditor();
// Logs: "✅ Lexical editor disabled. Reload page to apply."

// Reload page
location.reload();
```

### Check Current State

```javascript
// Check if Lexical mode is active
import { USE_LEXICAL_EDITOR } from '@clutter/editor';
console.log('Lexical mode:', USE_LEXICAL_EDITOR);
```

### Validate Migration Results

```javascript
// After enabling Lexical mode and loading a note:

// Check blocks in store
const { useBlockStore } =
  await import('/@fs/Users/sivakuv3/Documents/Learning/Clutter Notes/Clutter 2.0 - Legacy/packages/editor/engine/store/blockStore.ts');
const store = useBlockStore.getState();

console.log('Blocks in store:', store.getAllBlocks().length);
console.log('Root blocks:', store.getRootBlocks());

// Inspect specific block
const blocks = store.getAllBlocks();
const firstBlock = blocks[0];
console.log('First block:', firstBlock);
console.log('Content:', JSON.parse(firstBlock.content));
```

## Files Changed

**New Files:**

- `packages/editor/config/featureFlags.ts` - Feature flag system

**Modified Files:**

- `packages/ui/src/components/app-layout/pages/note/TipTapWrapper.tsx` - Migration at read
- `packages/editor/index.ts` - Export flags and migration

**Lines Added:** ~180

**Build:** ✅ Successful (576KB, +11KB for migration tools)

## Success Criteria

- ✅ Feature flag system working
- ✅ LocalStorage toggle functional
- ✅ Migration wired at read boundary
- ✅ PM JSON preserved (no writes)
- ✅ Error handling graceful
- ✅ Console logging observable
- ✅ Rollback instant (disable flag + reload)
- ✅ Build successful
- ✅ No breaking changes

## What This Enables

**Validation on Real Data:**

Before Step 7A:

- ❌ Can't test migration on real documents
- ❌ Don't know if edge cases exist
- ❌ Blind to production issues

After Step 7A:

- ✅ Test with ANY real document
- ✅ See migration results immediately
- ✅ Discover edge cases safely
- ✅ Validate blockId preservation
- ✅ Verify tree structure
- ✅ Zero data loss risk

**Risk-Free Testing:**

- Enable flag → test
- See issue → disable flag
- Fix converter → enable again
- Iterate rapidly

## Next Steps

### Step 7B: Shadow Render (Critical UX Validation)

**Goal:** Render Lexical editor alongside PM editor

**Tasks:**

1. Create `LexicalDocumentEditor` component
2. Wire migrated blocks to Lexical render
3. Conditional render: Lexical if flag, PM otherwise
4. Shadow mode: Both visible (Lexical hidden, PM visible)
5. Compare rendering, selection, performance

**Why critical:**

- Catches list nesting bugs
- Validates mark edge cases
- Tests empty block handling
- Verifies selection stability

**Estimated effort:** 2-3 hours

**Risk:** Low (PM fallback always available)

### Step 7C: Freeze PM Writes

**After 7B validates:**

1. Disable PM onChange
2. All edits go to block store
3. PM becomes read-only view

**At this point:** ProseMirror is functionally dead

### Step 7D: Delete ProseMirror

**Final cleanup:**

1. Remove TipTap/PM dependencies
2. Delete old editor files
3. Remove PM imports
4. Update persistence to blocks only

**Only after 7A-7C fully validated!**

## Production Rollout Strategy

### Phase 1: Internal Testing (Now)

```typescript
// Dev/staging only
localStorage.setItem('USE_LEXICAL_EDITOR', 'true');
```

**Validate:**

- Migration works on all dev documents
- No errors in console
- Tree structure correct
- Performance acceptable

### Phase 2: Dogfooding

```typescript
// Enable for team accounts
if (isTeamMember(userId)) {
  enableLexicalEditor();
}
```

**Validate:**

- Real usage patterns
- Edge cases discovered
- Performance under load

### Phase 3: Beta Users

```typescript
// Enable for opted-in users
if (user.betaFeatures.includes('lexical-editor')) {
  enableLexicalEditor();
}
```

**Collect:**

- User feedback
- Error reports
- Performance metrics

### Phase 4: Staged Rollout

```typescript
// Enable for percentage of users
if (hashUserId(userId) % 100 < rolloutPercentage) {
  enableLexicalEditor();
}
```

**Stages:**

- 1% → 5% → 10% → 25% → 50% → 100%
- Monitor metrics between stages
- Rollback if issues

### Phase 5: Full Deployment

```typescript
// Default to Lexical
export const USE_LEXICAL_EDITOR = true;
```

**Then:** Step 7D (delete ProseMirror)

## Monitoring

### Key Metrics

```typescript
// Track migration success rate
analytics.track('migration_attempted', {
  noteId,
  timestamp: Date.now(),
});

if (migrationResult.success) {
  analytics.track('migration_success', {
    noteId,
    blocksConverted: migrationResult.blocks.length,
    duration: Date.now() - start,
  });
} else {
  analytics.track('migration_failed', {
    noteId,
    errors: migrationResult.errors,
    duration: Date.now() - start,
  });
}
```

### Error Alerts

```typescript
// Alert on migration failures
if (!migrationResult.success) {
  Sentry.captureException(new Error('Migration failed'), {
    extra: {
      noteId,
      errors: migrationResult.errors,
      pmDoc: incomingContent,
    },
  });
}
```

## Rollback Plan

### Immediate Rollback (User-Level)

```javascript
// In console
disableLexicalEditor();
location.reload();
```

**Result:** User back on ProseMirror instantly

### Application-Level Rollback

```typescript
// In code
export const USE_LEXICAL_EDITOR = false;
```

**Result:** All users back on ProseMirror next reload

### No Data Loss

**Why it's safe:**

- PM JSON never modified
- Blocks only exist in memory (not persisted yet)
- Disable flag = instant recovery
- No database changes

## Known Limitations

### ✅ Intentional (Current Scope)

- **PM editor still renders** - Lexical render in Step 7B
- **No writes to blocks** - PM JSON remains source of truth
- **Migration on every load** - Blocks not cached (performance cost)
- **Console logging only** - No UI indicators yet

### ⏳ Coming in Step 7B

- Lexical editor rendering
- Shadow mode comparison
- Selection behavior validation
- Performance comparison

## Code Quality

- **New Files:** 1 (featureFlags.ts)
- **Modified Files:** 2 (TipTapWrapper.tsx, index.ts)
- **Lines Added:** ~180
- **TypeScript Errors:** 0
- **Build:** ✅ Successful
- **Bundle:** 576KB (+11KB, acceptable)

---

## Summary

**Step 7A: COMPLETE ✅**

**What we built:**

- Feature flag system
- Migration at read boundary
- Zero data loss risk
- Instant rollback
- Full observability

**What this enables:**

- Test with real documents
- Discover edge cases
- Validate conversion accuracy
- Zero-risk validation

**What's next:**

- Step 7B: Render Lexical editor
- Step 7B: Shadow mode for comparison
- Step 7C: Freeze PM writes
- Step 7D: Delete ProseMirror

**Critical insight:**

This is NOT "replace ProseMirror" yet.
This is "validate replacement is possible."

Integration first. Deletion last. ✅

---

**Ready to test with real documents!**

See testing guide above. 🚀
