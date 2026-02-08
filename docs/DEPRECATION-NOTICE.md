# ⚠️ DEPRECATION NOTICE

**Effective Date:** February 8, 2026

---

## Summary

The behavioral specification documents in this directory were written for the **pre-segmented architecture** and contain patterns that are now **FORBIDDEN** in the current system.

**DO NOT implement directly from these files.**

---

## What Changed

### Architecture Migration (Feb 2026)

The editor underwent a fundamental architecture change:

**OLD (Deprecated):**
```typescript
interface Node {
  text: string;           // ❌ DELETED
  meta: InlineMeta[];     // ❌ DELETED
}

interface CursorPosition {
  activeNodeId: NodeID;   // ❌ DELETED
  offset: number;
  bias: "before" | "after"; // ❌ DELETED
}
```

**NEW (Current):**
```typescript
interface Node {
  segments: readonly Segment[];  // ✅ ONLY text model
}

interface CursorPosition {
  nodeId: NodeID;
  segmentIndex: number;   // ✅ NEW
  offset: number;
}
```

---

## Deprecated Documents

### 🔴 OBSOLETE (Do Not Use)

| Document | Reason |
|----------|--------|
| `06.2-cursor-bias-semantics.md` | Bias field deleted; now uses segmentIndex |
| `ENFORCEMENT_CHECKLIST.md` | Replaced by hardening architecture |

These documents describe **deleted features**. Do not implement from them.

---

### 🟡 HISTORICAL REFERENCE ONLY

| Document | Status |
|----------|--------|
| `03-interaction-rules.md` | Behavioral intent valid, implementation details obsolete |
| `03.1-keyboard-enforcement-boundaries.md` | Principles valid, references need translation |
| `03.2-inline-boundary-rules.md` | Concepts valid, bias mechanism changed |
| `04-node-variants.md` | Structure valid, field references obsolete |
| `05-node-anatomy.md` | Structure valid, field references obsolete |
| `06-selection-semantics.md` | Principles valid, implementation changed |
| `06.1-caret-intervention-boundaries.md` | Principles valid, implementation changed |
| `07-markdown-shortcuts.md` | Behavioral intent valid |
| `07.1-markdown-trigger-semantics.md` | Principles valid |
| `07.2-markdown-consumption-undo.md` | Principles valid |
| `08-undo-history-semantics.md` | Principles valid |

These documents contain **useful behavioral intent** but reference **forbidden patterns**.

---

## How to Use These Documents

### ✅ DO:
- Read for **behavioral intent** (WHAT the editor should do)
- Understand **user-facing behavior** expectations
- Learn **general principles** (keyboard ownership, structural operations)

### ❌ DON'T:
- Copy implementation patterns directly
- Use references to `node.text`, `node.meta`, `bias`
- Implement DOM inspection patterns shown
- Follow state management patterns shown

---

## Current Architecture Reference

**For implementation, use:**

1. **[`architecture/MANIFEST.md`](./architecture/MANIFEST.md)** - Complete system reference
2. **[`architecture/HARDENING.md`](./architecture/HARDENING.md)** - Protection mechanisms
3. **[`architecture/SUMMARY.md`](./architecture/SUMMARY.md)** - Quick overview

**For practical development:**
- `apps/engine-demo/src/hardening/README.md` - Developer guide
- `apps/engine-demo/src/editor/index.ts` - Public API

---

## Translation Guide

When reading old specs, translate concepts:

| Old Pattern | New Pattern |
|-------------|-------------|
| `node.text` | `getPlainText(node.segments)` |
| `node.meta.filter(...)` | `node.segments.filter(s => s.type === 'inline')` |
| `cursor.bias = "before"` | Use `cursor.segmentIndex` positioning |
| `activeNodeId` | `cursor.nodeId` |
| `TreeWalker` | Direct segment iteration |
| `extractPureText()` | `getPlainText()` |
| Direct SegmentOps import | Import from `editor/index.ts` |

---

## Why These Documents Exist

These specifications represented **careful design work** and captured important behavioral requirements. They remain as:

1. **Historical record** - Design decisions made
2. **Behavioral reference** - What the editor should do
3. **Requirements documentation** - User-facing behavior

The **principles are still valid**. The **implementation patterns are not**.

---

## Enforcement

The current architecture is **hardened** with multiple enforcement layers:

- ✅ **TypeScript** - Old patterns won't compile
- ✅ **ESLint** - Static analysis blocks forbidden patterns
- ✅ **Runtime** - Assertions catch violations
- ✅ **CI** - `npm run lint:arch` enforces compliance

You **cannot accidentally** use deprecated patterns - the system will reject them.

---

## Questions?

- **Current architecture:** See [`architecture/MANIFEST.md`](./architecture/MANIFEST.md)
- **Forbidden patterns:** See [`architecture/MANIFEST.md`](./architecture/MANIFEST.md) Section VI
- **How to make changes:** See [`architecture/MANIFEST.md`](./architecture/MANIFEST.md) Section VIII

---

## Status

- ⚠️ **Behavioral specs:** Historical reference only
- ✅ **Architecture docs:** Current and maintained
- 🔒 **Enforcement:** Active on all layers

**Last Updated:** February 8, 2026

---

**For current architecture, start here:** [`architecture/README.md`](./architecture/README.md)
