# Documentation Index

Documentation for the Clutter 2.0 editor system.

---

## 🏛️ Current Architecture (ACTIVE)

**Location:** [`architecture/`](./architecture/)

The segmented editor architecture implemented as of February 2026.

### Core Documents
- **[MANIFEST.md](./architecture/MANIFEST.md)** - Complete system reference
- **[HARDENING.md](./architecture/HARDENING.md)** - Protection mechanisms
- **[SUMMARY.md](./architecture/SUMMARY.md)** - Executive summary

**→ START HERE for current architecture**

---

## 📚 Behavioral Specifications (HISTORICAL)

**⚠️ WARNING:** These documents describe the PRE-HARDENING architecture and contain **DEPRECATED patterns**.

The specifications below were written before the segmented architecture migration and reference concepts that are now **FORBIDDEN**:
- ❌ `node.text` / `node.meta` (deleted fields)
- ❌ `CursorBias` (deleted concept)
- ❌ Dual text models (only segments exist now)
- ❌ Direct DOM inspection (now abstracted)

### Status of Behavioral Specs

| Document | Status | Notes |
|----------|--------|-------|
| 03-interaction-rules.md | 🟡 PARTIALLY VALID | General keyboard behavior still valid, but implementation details obsolete |
| 03.1-keyboard-enforcement-boundaries.md | ✅ VALID | Keyboard ownership rules still apply |
| 03.2-inline-boundary-rules.md | 🟡 NEEDS UPDATE | Concepts valid, but bias mechanism changed |
| 06.2-cursor-bias-semantics.md | 🔴 DEPRECATED | Bias field deleted, now uses segmentIndex |
| ENFORCEMENT_CHECKLIST.md | 🔴 OBSOLETE | Replaced by hardening architecture |

### How to Use Historical Specs

**For behavioral intent (WHAT):**
- ✅ Keyboard interaction rules (Enter, Backspace, Tab)
- ✅ Structural operations (split, merge, indent)
- ✅ General principles

**For implementation details (HOW):**
- ❌ Ignore references to `node.text`, `node.meta`, `bias`
- ❌ Ignore DOM inspection patterns
- ✅ Refer to [`architecture/MANIFEST.md`](./architecture/MANIFEST.md) instead

---

## 🔄 Migration Guide

### If You're Reading Old Specs

**Translate concepts:**

| Old Concept | New Concept |
|-------------|-------------|
| `node.text` | `getPlainText(node.segments)` |
| `node.meta` | `node.segments` (inline segments) |
| `cursor.bias` | `cursor.segmentIndex` + `cursor.offset` |
| `activeNodeId` + `offset` | `cursor.nodeId` + `cursor.segmentIndex` + `cursor.offset` |
| `TreeWalker` / DOM inspection | Direct segment iteration |

**For implementation:**
1. Read the old spec for behavioral intent
2. Implement using [`architecture/MANIFEST.md`](./architecture/MANIFEST.md) patterns
3. Verify with `npm run lint:arch`

---

## 📁 Document Organization

```
docs/
├── architecture/              ← CURRENT (start here)
│   ├── README.md             (Navigation)
│   ├── MANIFEST.md           (Complete reference)
│   ├── HARDENING.md          (Protection)
│   └── SUMMARY.md            (Overview)
│
├── 03-*.md                    ← HISTORICAL (behavioral specs)
├── 04-*.md                    ← HISTORICAL
├── 05-*.md                    ← HISTORICAL
├── 06-*.md                    ← HISTORICAL (contains deprecated patterns)
├── 07-*.md                    ← HISTORICAL
├── 08-*.md                    ← HISTORICAL
└── ENFORCEMENT_CHECKLIST.md   ← OBSOLETE (replaced by hardening/)
```

---

## 🎯 Quick Reference

**I want to...**

| Goal | Document |
|------|----------|
| Understand current architecture | [`architecture/SUMMARY.md`](./architecture/SUMMARY.md) |
| Make code changes | [`architecture/MANIFEST.md`](./architecture/MANIFEST.md) Section VIII |
| Understand protection mechanisms | [`architecture/HARDENING.md`](./architecture/HARDENING.md) |
| Learn forbidden patterns | [`architecture/MANIFEST.md`](./architecture/MANIFEST.md) Section VI |
| Understand keyboard behavior | `03-interaction-rules.md` (translate to new arch) |
| See what changed | [`architecture/COMPLETE.md`](./architecture/COMPLETE.md) |

---

## ⚠️ Important Notes

### For New Developers
- **Start with [`architecture/`](./architecture/)** - The current system
- Skip the numbered specs unless you need historical context
- The enforcement checklist is obsolete - use `npm run lint:arch` instead

### For Existing Developers
- The architecture changed fundamentally in Feb 2026
- Old patterns are now **FORBIDDEN** (enforced by ESLint + CI)
- Behavioral intent is preserved, implementation is new

### For AI Assistants
- Do NOT reference `06.2-cursor-bias-semantics.md` for implementation
- Do NOT use patterns from `ENFORCEMENT_CHECKLIST.md`
- ALWAYS verify against [`architecture/MANIFEST.md`](./architecture/MANIFEST.md)
- ALWAYS run `npm run lint:arch` to verify compliance

---

## 🔒 Canonical Truth

**Single source of truth for architecture:**
- [`architecture/MANIFEST.md`](./architecture/MANIFEST.md)

**Single source of truth for enforcement:**
- [`architecture/HARDENING.md`](./architecture/HARDENING.md)
- `apps/engine-demo/src/hardening/` (runtime)
- `apps/engine-demo/.eslintrc.hardening.js` (static)

If anything conflicts with these, **the architecture docs are correct**.

---

## 📅 Timeline

- **2025-2026:** Behavioral specs written (numbered files)
- **Feb 2026:** Segmented architecture implemented
- **Feb 8, 2026:** Architecture hardened and locked
- **Current:** Numbered specs are historical reference only

---

**Status:** Architecture locked 🔒 | Documentation current ✅

**Last Updated:** February 8, 2026
