# Clutter 2.0 - Segmented Editor

Modern note-taking application with a hardened, type-safe editor architecture.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Check architecture
npm run lint:arch
```

## 📖 Documentation

### ⭐ Start Here
- **[Architecture Docs](./docs/architecture/)** - Complete system documentation (CURRENT)
  - [MANIFEST.md](./docs/architecture/MANIFEST.md) - System reference ⭐
  - [HARDENING.md](./docs/architecture/HARDENING.md) - Protection mechanisms
  - [SUMMARY.md](./docs/architecture/SUMMARY.md) - Quick overview

### For Developers
- **[Hardening Guide](./apps/engine-demo/src/hardening/README.md)** - How to use architectural safeguards
- **[Documentation Index](./docs/README.md)** - All docs organized

### Historical Reference
- **[Historical Specs](./docs/)** - Numbered behavioral specs (translate to current)
  - ⚠️ Contains deprecated patterns - use with [translation guide](./docs/DEPRECATION-NOTICE.md)
  - Behavioral intent remains valid, implementation changed

## 🏗️ Architecture

### Single Source of Truth
```typescript
interface Node {
  segments: readonly Segment[];  // ← ONLY text model
}
```

### Consolidated Flow (Zero Duplication)
```
UI → SegmentedEditor → SegmentOps → Hardening Layer
                                      └─ performGuaranteedSplit()
                                         ├─ Validation
                                         ├─ Exhaustive cases
                                         └─ Content preservation
```

### Enforcement Layers (All Active)
- ✅ **TypeScript** - Compile-time type safety
- ✅ **ESLint** - Static analysis
- ✅ **Runtime** - Assertions and invariants
- ✅ **Hardening** - Single implementation with validation
- ✅ **Tests** - 82+ tests (same code path as UI)
- ✅ **CI** - Automated checks

### Guarantees
- 🔒 Content preservation in all operations
- 🔒 No cursor drift possible
- 🔒 Single text model enforced
- 🔒 Architecture regression blocked
- 🔒 **Zero duplication** - Hardening layer is sole implementation

See [Consolidated Architecture](./ARCHITECTURE-CONSOLIDATED.md) for details.

## 📁 Structure

```
apps/
├── engine-demo/          ← Main editor (ONLY editor)
    ├── src/
    │   ├── NodeEditor.tsx       (UI dispatcher)
    │   ├── editor/              (Text logic)
    │   │   ├── SegmentedEditor.ts
    │   │   ├── SegmentOps.ts
    │   │   └── SegmentQuery.ts
    │   └── hardening/           (Enforcement)
    │       ├── invariants.ts
    │       ├── keyboard-ownership.ts
    │       └── split-state-machine.ts

docs/
├── architecture/         ← Architecture documentation
└── *.md                  ← Behavior specifications
```

## 🔧 Development

### Adding Features
1. Add logic to `SegmentedEditor` or `SegmentQuery`
2. Export from `editor/index.ts`
3. Call from `NodeEditor.tsx`
4. Run `npm run lint:arch`

See [MANIFEST.md](./docs/architecture/MANIFEST.md) Section VIII for details.

### Testing
```bash
npm run test                              # All tests
npm test -- split-merge-exhaustive --run  # 51 split/merge tests
npm run test:hardening                    # Architecture tests only
npm run lint:arch                         # Architecture validation
```

**Current Status:** ✅ **82+ tests passing** (51 split/merge + 31 architectural)

**Detailed guides:**
- [`TESTING-GUIDE.md`](./TESTING-GUIDE.md) - Complete testing documentation
- [`apps/engine-demo/SPLIT-MERGE-TEST-REPORT.md`](./apps/engine-demo/SPLIT-MERGE-TEST-REPORT.md) - Split/merge coverage analysis

### Forbidden Patterns
```typescript
// ❌ FORBIDDEN
node.text                    // Field doesn't exist
import from './SegmentOps'   // Internal API

// ✅ CORRECT
getPlainText(node.segments)  // Utility function
import from './editor'       // Public API
```

See [Forbidden Patterns](./docs/architecture/MANIFEST.md#vi-forbidden-patterns).

## 🧪 Testing

```bash
# Architecture validation (FAST)
npm run lint:arch               # Check architecture locks (2 sec)
npm run test:hardening          # Run hardening tests (5 sec)

# Run all tests
npm test                        # Watch mode
npm run test:run                # Run once
npm test -- --ui                # Test UI

# Coverage
npm run test:coverage

# E2E tests
npm run test:e2e                # Playwright tests
```

**📖 Complete Testing Guide:** [`TESTING-GUIDE.md`](./TESTING-GUIDE.md)

## 🏛️ Architecture Status

```bash
$ npm run lint:arch
🎯 ALL ARCHITECTURAL LOCKS VERIFIED ✅
```

- **Editors:** 1 (enforced)
- **Text models:** 1 (segments only)
- **Legacy patterns:** 0
- **Type safety:** 100%
- **Tests:** 31+ passing
- **CI:** Active

## 📚 Learn More

- [Architecture Overview](./docs/architecture/SUMMARY.md) - Start here
- [Complete Reference](./docs/architecture/MANIFEST.md) - Full documentation
- [Hardening Details](./docs/architecture/HARDENING.md) - Security measures
- [Developer Guide](./apps/engine-demo/src/hardening/README.md) - Practical usage

## 🔒 Security

This codebase uses multiple enforcement layers to prevent architectural regression:
- Compile-time type safety
- Static analysis (ESLint)
- Runtime invariants
- Comprehensive tests
- CI validation

See [HARDENING.md](./docs/architecture/HARDENING.md) for details.

## 📄 License

[Add your license here]

---

**Status:** Architecture locked 🔒 | All systems operational ✅
