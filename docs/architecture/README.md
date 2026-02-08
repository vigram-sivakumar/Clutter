# Architecture Documentation

Comprehensive documentation of the Clutter 2.0 segmented editor architecture.

## Core Documents

### 📘 [MANIFEST.md](./MANIFEST.md)
**The complete system reference.**
- Architecture principles
- System components
- Enforcement layers
- Operation contracts
- Maintenance procedures

**Read this first for a complete understanding.**

---

### 🔒 [HARDENING.md](./HARDENING.md)
**Zero-risk hardening measures.**
- Runtime invariants
- Keyboard ownership
- Split state machine
- ESLint enforcement
- CI checks
- Testing strategy

**Read this to understand how the architecture is protected.**

---

### 📊 [SUMMARY.md](./SUMMARY.md)
**Executive summary.**
- What was achieved
- Current state guarantees
- Impossible bugs
- Defense layers
- Quick reference

**Read this for a high-level overview.**

---

### 📝 [IMPLEMENTATION-LOG.md](./IMPLEMENTATION-LOG.md)
**Build history.**
- Timeline of hardening implementation
- Files created/modified
- Verification results

**Read this to understand what was done and when.**

---

## Quick Navigation

**New to the codebase?**
1. Start with [SUMMARY.md](./SUMMARY.md) - 5 min read
2. Then [MANIFEST.md](./MANIFEST.md) - Complete reference
3. Then [HARDENING.md](./HARDENING.md) - Protection mechanisms

**Making changes?**
1. Check [MANIFEST.md](./MANIFEST.md) Section VIII - Maintenance Procedures
2. Review [HARDENING.md](./HARDENING.md) - What's enforced
3. Run `npm run lint:arch` before committing

**Architecture questions?**
- See [MANIFEST.md](./MANIFEST.md) Section VI - Forbidden Patterns
- See [HARDENING.md](./HARDENING.md) - Defense layers
- Check `hardening/README.md` for developer guide

---

## Related Documentation

- [`/docs/README.md`](../README.md) - Documentation index (explains historical vs current)
- [`/docs/DEPRECATION-NOTICE.md`](../DEPRECATION-NOTICE.md) - Guide to using historical specs
- `/docs/03-interaction-rules.md` - Keyboard behavior (translate to new architecture)
- `apps/engine-demo/src/hardening/README.md` - Developer guide for hardening features

**⚠️ Note:** Numbered spec files in `/docs/` are historical reference only. See [`DEPRECATION-NOTICE.md`](../DEPRECATION-NOTICE.md) for details.

---

## Status

**Architecture:** LOCKED 🔒  
**Enforcement:** Active (5 layers)  
**Tests:** 31+ passing  
**Documentation:** Complete  

Last Updated: February 8, 2026
