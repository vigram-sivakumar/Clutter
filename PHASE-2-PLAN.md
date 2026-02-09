# 🏗️ PHASE 2 PLAN — ARCHITECTURE INTEGRATION

**Status:** READY TO START  
**Date:** 2026-02-09  
**Prerequisites:** ✅ All handlers migrated (Batch 1+2+3 complete)  
**Goal:** Move execution logic from NodeEditor.tsx to EditorCoordinator  

---

## 🎯 PHASE 2 OBJECTIVE

**Transform NodeEditor.tsx from orchestrator to pure UI dispatcher.**

### **Before (Current State):**
```
NodeEditor.tsx
├── Event handlers (wrapped with pure handlers) ✅
├── Temporary orchestration (TO MOVE) ⚠️
│   ├── DOM extraction
│   ├── State updates
│   ├── Observer lifecycle
│   └── RAF scheduling
└── Pure UI (KEEP) ✅
```

### **After (Phase 2):**
```
NodeEditor.tsx (Pure UI)
├── Event wire-up
├── Render nodes
└── Call coordinator

EditorCoordinator.ts (New)
├── Orchestrate operations
├── Handle DOM extraction
├── Manage observers
└── Update state

Pure Handlers (Unchanged)
└── Validation only
```

---

## 📋 PHASE 2 STRATEGY

### **Approach: Incremental Extraction**

Same strategy as Batches 1-3:
1. Extract small, testable pieces
2. Test after each extraction
3. Commit frequently
4. Manual testing at checkpoints

### **NOT a Big Bang Rewrite**
- ❌ Don't refactor everything at once
- ✅ Move one operation at a time
- ✅ Keep old code running in parallel
- ✅ Verify equivalence at each step

---

## 🗺️ PHASE 2 ROADMAP

### **Phase 2.1: Create Coordinator Foundation** (30 min)
Create `EditorCoordinator.ts` with basic structure:
- Coordinator class/context
- Basic operation orchestration
- State update interface
- Observer management interface

**Risk:** LOW (net new code, doesn't touch existing)

---

### **Phase 2.2: Move Tab/Shift+Tab Execution** (45 min)
Simplest operations to start with:
- Move `indentNode()` to coordinator
- Move `outdentNode()` to coordinator
- Wire NodeEditor.tsx to call coordinator
- Keep old code as fallback
- Test Tab/Shift+Tab exhaustively

**Risk:** LOW (pure tree operations, no DOM, no cursor math)

---

### **Phase 2.3: Move Arrow Key Execution** (1 hour)
- Move `computeArrowTargetCursor()` orchestration
- Move DOM extraction for arrow context
- Wire NodeEditor.tsx to call coordinator
- Test offset preservation

**Risk:** MEDIUM (cursor math, requires DOM reads)

---

### **Phase 2.4: Move Enter Execution** (1.5 hours)
Most complex due to DOM reads and observer timing:
- Move `handleSegmentedEnter()` orchestration
- Move DOM extraction timing
- Move observer stop/start logic
- Move RAF scheduling
- Wire NodeEditor.tsx to call coordinator
- Test all split scenarios + emoji bug

**Risk:** HIGH (observer timing, race conditions, Batch 2 bugs)

**CRITICAL:** This must not regress Batch 2 fixes
- Bug #1: Merge cursor position
- Bug #2: Merge with inline elements
- Bug #3: Text loss in caret-anchors
- Bug #4: Race conditions
- Emoji bug: Segment identity

---

### **Phase 2.5: Move Backspace Execution** (1 hour)
- Move `handleSegmentedBackspace()` orchestration
- Move `mergeWithPrevious()` orchestration
- Move DOM extraction for merge
- Wire NodeEditor.tsx to call coordinator
- Test all merge scenarios

**Risk:** HIGH (merge cursor math, Batch 2 bugs)

**CRITICAL:** Must preserve `mergeWithPrevious` V3 logic
- Cursor at junction point
- Inline element handling
- Empty node handling

---

### **Phase 2.6: Move Blur/Selection/Composition Execution** (45 min)
Simpler operations (non-structural):
- Move blur commit logic
- Move selection cursor update
- Move composition flag management
- Wire NodeEditor.tsx to call coordinator
- Test each handler

**Risk:** LOW (no structural changes)

---

### **Phase 2.7: Add Segment Normalization** (1.5 hours)
Implement tracked feature from `PHASE-2-NORMALIZATION-TODO.md`:
- Create `normalizeSegments()` utility
- Add cursor translation logic
- Call after merge operations
- Call after split operations
- Add invariant enforcement
- Test thoroughly

**Risk:** MEDIUM (cursor translation, model invariants)

**CRITICAL:** Must translate cursors correctly
- Merge consecutive text segments
- Preserve cursor validity
- Handle edge cases (empty, all inline, etc.)

---

### **Phase 2.8: Remove Old Code from NodeEditor.tsx** (30 min)
Clean up after all operations moved:
- Remove temporary orchestration
- Remove old execution logic
- Remove bridge comments
- Keep only UI and coordinator calls
- Verify no regressions

**Risk:** LOW (cleanup only, everything already working)

---

### **Phase 2.9: Full Integration Testing** (1 hour)
Comprehensive testing of entire editor:
- All Batch 1 tests
- All Batch 2 tests
- All Batch 3 tests
- Normalization tests
- Integration tests
- Performance testing

**Risk:** DISCOVERY (may find integration bugs)

---

## 📊 PHASE 2 BREAKDOWN

| Step | Task | Duration | Risk | Blocker |
|------|------|----------|------|---------|
| 2.1 | Coordinator foundation | 30 min | LOW | None |
| 2.2 | Tab/Shift+Tab | 45 min | LOW | 2.1 |
| 2.3 | Arrow keys | 1 hour | MEDIUM | 2.2 |
| 2.4 | Enter | 1.5 hours | HIGH | 2.3 |
| 2.5 | Backspace | 1 hour | HIGH | 2.4 |
| 2.6 | Blur/Selection/Composition | 45 min | LOW | 2.5 |
| 2.7 | Segment normalization | 1.5 hours | MEDIUM | 2.6 |
| 2.8 | Cleanup | 30 min | LOW | 2.7 |
| 2.9 | Integration testing | 1 hour | DISCOVERY | 2.8 |

**Total Estimated Duration:** 8-10 hours (with breaks and bug fixes)

---

## 🧪 TESTING STRATEGY

### **After Each Step:**
1. Run automated tests (if any)
2. Manual testing of moved operation
3. Regression testing of all previous operations
4. Commit if passing

### **Checkpoints for Manual Testing:**
- ✅ After 2.2 (Tab/Shift+Tab)
- ✅ After 2.3 (Arrow keys)
- ✅ After 2.4 (Enter) ← **CRITICAL**
- ✅ After 2.5 (Backspace) ← **CRITICAL**
- ✅ After 2.6 (Blur/Selection/Composition)
- ✅ After 2.7 (Normalization)
- ✅ After 2.9 (Full integration)

### **What to Test at Each Checkpoint:**
1. The newly moved operation
2. All previously moved operations
3. Any operations that interact with it

---

## 🔒 CRITICAL INVARIANTS TO PRESERVE

### **From Batch 2 Fixes:**
1. **Segment extraction preserves identity** (emoji bug fix)
   - Each DOM text node = one segment
   - No merging during extraction
   - `segmentIndex` remains valid

2. **Merge cursor at junction point** (Bug #1, #2 fixes)
   - `junctionIndex = previous.segments.length`
   - Cursor placed at `(junctionIndex, 0)`
   - Handles inline elements correctly

3. **Caret-anchor text extraction** (Bug #3 fix)
   - Extract text from caret-anchor spans
   - Use `sel.anchorOffset` for cursor position
   - Don't skip contentEditable="true" text

4. **Observer timing stability** (Bug #4 fix)
   - Stop observer BEFORE DOM reads
   - Synchronous DOM reads only
   - No race conditions

### **From Batch 1 Fixes:**
5. **Level-based indent/outdent**
   - `indentNode`: `newParentId = candidate.id`
   - `outdentNode`: adopts following siblings
   - Always +1/-1 level

6. **Arrow offset preservation**
   - Use `getCursorOffsetInPlainText()`
   - Use `findSegmentAtPlainTextOffset()`
   - Preserves offset across nodes

---

## 🎯 SUCCESS CRITERIA

Phase 2 is complete when:
- ✅ All execution logic moved to EditorCoordinator
- ✅ NodeEditor.tsx is pure UI dispatcher
- ✅ All handlers still work correctly
- ✅ All Batch 1+2+3 tests pass
- ✅ Segment normalization implemented
- ✅ No data loss
- ✅ No cursor bugs
- ✅ No observer bugs
- ✅ Clean code (no temporary bridges)
- ✅ Documented and committed

---

## 🚨 HIGH-RISK AREAS

### **1. Observer Lifecycle (Phase 2.4, 2.5)**
**Why risky:**
- Complex timing requirements
- Race conditions possible
- Batch 2 Bug #4 was here

**Mitigation:**
- Move observer stop/start timing exactly as-is
- Test extensively
- Add debug logging if needed

---

### **2. Cursor Math (Phase 2.4, 2.5, 2.7)**
**Why risky:**
- Easy to off-by-one
- Inline elements add complexity
- Batch 2 Bugs #1, #2 were here

**Mitigation:**
- Don't modify cursor logic
- Move code exactly as-is
- Test all edge cases

---

### **3. Segment Extraction (Phase 2.4, 2.5)**
**Why risky:**
- Emoji bug was here
- Caret-anchor handling complex
- Data loss possible

**Mitigation:**
- Don't touch `extractSegmentsFromDOM`
- Keep 1:1 DOM→segment mapping
- Test emoji scenarios

---

### **4. Normalization (Phase 2.7)**
**Why risky:**
- New feature
- Cursor translation required
- Could break existing cursor logic

**Mitigation:**
- Implement with cursor translation from start
- Add extensive tests
- Test all edge cases
- Keep as opt-in initially

---

## 📝 ARCHITECTURAL PRINCIPLES

### **Rules for Phase 2:**

1. **One Operation at a Time**
   - Don't move multiple operations together
   - Test after each move
   - Commit frequently

2. **Preserve Existing Logic**
   - Don't refactor while moving
   - Move code exactly as-is
   - Refactor later if needed

3. **Keep Fallbacks Temporarily**
   - Old code runs in parallel during transition
   - Remove only after full verification
   - Easy rollback if issues

4. **Test Exhaustively**
   - Manual testing at every checkpoint
   - All previous operations every time
   - Edge cases and integration

5. **Don't Break Batch 2 Fixes**
   - Emoji bug must not regress
   - Merge cursor must not regress
   - Observer timing must not regress
   - Caret-anchor handling must not regress

---

## 🔄 ROLLBACK PLAN

If anything breaks during Phase 2:

### **Option 1: Revert Last Step**
```bash
git revert HEAD
```
- Removes only the last commit
- Previous steps remain
- Continue from last good state

### **Option 2: Revert to Batch 3 Complete**
```bash
git revert <commit-range>
```
- Return to known good state
- All handlers still migrated
- Restart Phase 2 with new approach

### **Option 3: Fix Forward**
- Debug the issue
- Fix in place
- Continue forward

---

## 📅 EXECUTION PLAN

### **Step 1: Get Approval**
Show this plan to user, confirm approach.

### **Step 2: Start Phase 2.1**
Create coordinator foundation (net new code, low risk).

### **Step 3: Execute 2.2 → 2.9**
One step at a time, test after each, commit when passing.

### **Step 4: Lock Phase 2**
Full integration testing, final commit, documentation.

---

## 🎯 WHAT HAPPENS AFTER PHASE 2?

### **Phase 3 (Future):**
- Add comprehensive test suite
- Add property-based tests for invariants
- Performance optimization
- Polish and refinement

### **Phase 4 (Future):**
- Feature development using new architecture
- Multi-select operations
- Advanced formatting
- Collaboration features

---

## ✅ PRE-FLIGHT CHECKLIST

Before starting Phase 2:
- ✅ All handlers migrated (Batch 1+2+3)
- ✅ All code committed
- ✅ No pending changes
- ✅ Editor working correctly
- ⏳ User approval for Phase 2 plan

---

## 🚀 READY TO START

**Phase 2 is ready to begin.**

**What would you like to do?**

### **Option A: Start Phase 2.1** (Create coordinator foundation)
- Begin execution immediately
- Low risk, net new code
- ~30 minutes

### **Option B: Review plan first**
- Discuss approach
- Adjust strategy
- Confirm timing

### **Option C: Manual test Batch 3 first**
- Verify all handlers work
- Test edge cases
- Ensure stability before Phase 2

---

**Your call. Ready when you are.**

---

**END OF PHASE 2 PLAN**
