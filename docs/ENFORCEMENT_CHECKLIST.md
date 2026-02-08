# ⚠️ THIS DOCUMENT IS DEPRECATED

**Original:** Cursor AI Enforcement Checklist  
**Status:** 🔴 OBSOLETE  
**Date Deprecated:** February 8, 2026

---

## Why Deprecated

This checklist was written for the **pre-hardened architecture** and has been **replaced** by:

1. **Automated enforcement** - ESLint + CI + Runtime assertions
2. **Architecture documentation** - [`architecture/HARDENING.md`](./architecture/HARDENING.md)
3. **Test suites** - 31+ architectural tests

---

## Current Enforcement

**Instead of this checklist, use:**

### Static Enforcement (Compile-Time)
```bash
npm run lint:arch  # Architecture locks check
```

### Runtime Enforcement
- Assertions in `apps/engine-demo/src/hardening/invariants.ts`
- Automatic crashes on invalid state

### Test Enforcement
```bash
npm run test:hardening  # Hardening tests
npm test               # All tests including architecture
```

---

## Documentation References

**For current enforcement:**
- [`architecture/HARDENING.md`](./architecture/HARDENING.md) - Complete protection measures
- [`architecture/MANIFEST.md`](./architecture/MANIFEST.md) - Forbidden patterns
- `apps/engine-demo/src/hardening/README.md` - Developer guide

---

## Historical Context

This checklist was manually enforced guidance for AI assistants. It has been replaced by:
- **Compiler enforcement** (TypeScript)
- **Linter enforcement** (ESLint)
- **Runtime enforcement** (Assertions)
- **CI enforcement** (Automated checks)

The system now **self-enforces** correctness automatically.

---

**For current enforcement:** [`../architecture/HARDENING.md`](../architecture/HARDENING.md)

---

_Original document moved to version control for historical reference._
_Manual enforcement is no longer needed._
