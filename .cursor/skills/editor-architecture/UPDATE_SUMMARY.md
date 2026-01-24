# Editor Architecture Skill - Update Summary

**Updated:** January 23, 2026  
**Based on:** Project documentation analysis

## What Was Updated

The editor architecture skill has been comprehensively expanded from ~280 lines to ~1075 lines based on deep analysis of the project's documentation.

## New Sections Added

### 0. Block Creation Contract (NEW)
- **The Golden Rule**: ALL block creation must use centralized functions
- **Three creation functions**: `createBlockNode()`, `createCleanBlockAttrs()`, `updateBlockAttrs()`
- **Decision tree**: When to use each function
- **Anti-patterns**: Manual `.create()` calls, passing `blockId` to updates
- **Enforcement**: TypeScript types, runtime validation, ESLint rules

### 3. Chrome Architecture (MASSIVELY EXPANDED)
- **The Architectural Rule**: Never attach hover to NodeViews
- **Container-level hover detection**: Single `mousemove` listener pattern
- **DOM stability**: Why NodeView hover handlers fail
- **Implementation patterns**: Complete code examples
- **State management**: Atomic updates, opacity-based visibility
- **Positioning**: Ref-based, `useLayoutEffect`, GPU transforms

### 3A. Transaction Mutation Ownership (NEW)
- **Critical rule**: Only `@clutter/editor` may manipulate transactions
- **Package boundaries**: What each layer can and cannot do
- **Enforcement**: Centralized APIs, ESLint, code review
- **Why it matters**: Data integrity, clear ownership

### 3B. Keyboard Handler Architecture (NEW)
- **Golden rules**: UI intent always wins, mandatory wrapper, single source of truth
- **`withUISafety` wrapper**: Automatic UI precedence
- **`uiIntent.ts` registry**: Single source of truth for UI components
- **Handler return contract**: `true` = dispatched, `false` = pass through
- **Adding UI components**: Simple registration process

### 3C. Floating UI Architecture (NEW)
- **Anchor vs Layout Policy**: Core separation of concerns
- **Responsibility table**: Who owns what
- **Component provides anchor**: Position intent only
- **FloatingMenu applies policy**: Flip, clamp, measure, viewport
- **Anti-patterns**: Hardcoded dimensions, flip logic in components

## Quick Reference Expanded

Added 12 architectural concepts to the quick reference table:
- Block creation functions
- Block updates with immutable blockId
- Transaction ownership boundaries
- Container-level hover (never NodeViews)
- Keyboard handler wrapping
- Floating UI anchor/policy separation

## Anti-Patterns Section Expanded

Transformed from 8 items to **7 comprehensive categories** with 30+ specific anti-patterns:

1. **Block Model Anti-Patterns** (5 patterns)
2. **Block Creation Anti-Patterns** (5 patterns)
3. **Chrome Architecture Anti-Patterns** (10 patterns)
4. **Cursor & Interaction Anti-Patterns** (4 patterns)
5. **Keyboard Handler Anti-Patterns** (5 patterns)
6. **Floating UI Anti-Patterns** (4 patterns)
7. **Transaction Ownership Anti-Patterns** (3 patterns)

Each anti-pattern now includes:
- ❌ What's wrong
- Why it's wrong
- ✅ Correct approach

## Common Scenarios Section Expanded

From 4 basic scenarios to **8 detailed scenarios** with complete code examples:

1. Adding a new block type (schema + component + creation)
2. Enter key creates sibling (with `withUISafety`)
3. Tab key indents block (with `updateBlockAttrs`)
4. Converting block type (slash command pattern)
5. Adding chrome hover to new block (zero hover logic needed!)
6. Adding a new floating menu (anchor only)
7. Adding keyboard shortcut with UI (uiIntent registration)
8. Implementing block folding (flat traversal)

Plus troubleshooting scenarios for common issues.

## Integration Section Expanded

From 3 file references to **26 specific file references** organized by category:

- **Core** (3 files)
- **Block Creation** (3 files)
- **Chrome System** (3 files)
- **Block Components** (6 files)
- **Keyboard Handlers** (4 files + directory)
- **Floating UI** (3 files)

Each reference includes what pattern to follow from that file.

## Documentation Sources

This update was based on comprehensive analysis of:
- `BLOCK_CREATION_CONTRACT.md`
- `EDITOR_CHROME_LAYER.md`
- `CHROME_FINAL_STATUS.md`
- `CHROME_DOM_STABILITY_FIX.md`
- `CHROME_HOVER_FIX.md`
- `CHROME_NEGATIVE_MARGIN_FIX.md`
- `plugins/keyboard/ARCHITECTURE.md`
- `FLOATING_UI_ARCHITECTURE.md`
- `ARCHITECTURE.md` (package boundaries)
- `KNOWN_ISSUES.md`

## Key Architectural Insights Captured

### 1. DOM Stability is Paramount
NodeViews are ephemeral and replaced frequently. Container-level detection with fresh queries is the only stable approach.

### 2. Separation of Concerns
- Blocks: Pure structure with `data-block-id`
- Chrome: Pure visual overlay
- Hover: Container-level detection
- Each layer has one job

### 3. Centralized Mutations
All block creation and updates flow through typed, validated functions. No raw `schema.nodes.X.create()` calls.

### 4. UI Intent Precedence
Structural keyboard handlers automatically defer to UI components through the `withUISafety` wrapper and `uiIntent.ts` registry.

### 5. Anchor vs Policy
Components declare intent (where they want UI). Foundation layers apply policy (where it actually appears).

## Skill Quality Metrics

- **Completeness**: ✅ Covers all major editor subsystems
- **Specificity**: ✅ Concrete code examples for every pattern
- **Enforcement**: ✅ Documents TypeScript, ESLint, and runtime validation
- **Anti-patterns**: ✅ 30+ specific things NOT to do
- **Scenarios**: ✅ 8 complete real-world examples
- **File references**: ✅ 26 actual implementation files
- **Searchability**: ✅ Emojis, tables, clear headers

## Usage

This skill will now automatically trigger when working on:
- Editor blocks
- Chrome layer
- Block creation
- Hover detection
- Indent handling
- Transactions
- Keyboard handlers
- Floating UI
- Any editor-related features

The agent will enforce these patterns and reject solutions that violate the architectural rules.
