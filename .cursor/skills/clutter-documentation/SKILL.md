---
name: clutter-documentation
description: Writing architectural and technical documentation for the Clutter Notes project. Use when creating or updating .md files, documenting architecture, writing contracts, creating guides, or when the user asks to document features, patterns, or decisions.
---

# Clutter Documentation Style Guide

This skill teaches how to write documentation that matches the Clutter Notes project's established patterns and quality standards.

## Quick Reference

| Document Type | Key Elements |
|--------------|-------------|
| **Architecture** | Status badge, boundaries table, dependency graph, enforcement rules |
| **Contracts** | The Golden Rule, decision tree, anti-patterns, verification checklist |
| **Guides** | Table of contents, usage patterns, before/after examples, migration steps |
| **Testing** | Automated test count, manual checklist, edge cases |

---

## Core Documentation Principles

### 1. Visual Hierarchy with Emojis

Use emojis strategically for scanability:

```markdown
## 🏗️ Architecture
## 🔒 Security
## ✅ Completed
## ❌ Anti-Patterns
## 🔍 Verification
## 🚨 Critical
## 📚 Related Documents
## 🎯 Summary
## 🔄 Migration
## 💾 Data
## 🧪 Testing
```

### 2. Status Badges

Start important documents with status:

```markdown
**Status:** ✅ Enforced (Manual + ESLint Ready)  
**Last Updated:** 2026-01-23
```

### 3. The Golden Rule Pattern

Lead with the most critical rule:

```markdown
## 🔒 **THE GOLDEN RULE**

**ALL block creation MUST go through centralized creation functions.**

❌ **NEVER** call `schema.nodes.X.create()` directly  
✅ **ALWAYS** use `createBlockNode()` or `createCleanBlockAttrs()`
```

---

## Document Structure Templates

### Template 1: Architecture Document

```markdown
# [Feature Name] - Architecture

## 🏗️ Package Architecture

[High-level description]

[ASCII diagram of structure]

---

## 🔒 Architectural Boundaries

### **Enforced by [Tool]** ([mechanism])

[Table or list of boundaries]

### Boundary X — Description

- **Can import from:** ✅ [list]
- **Cannot import from:** ❌ [list]
- **Purpose:** [description]
- **Example:** [code reference]

---

## 📋 Dependency Graph

```
[ASCII diagram showing dependencies]
```

---

## 🎯 Design Principles

### **1. Principle Name**

[Description]

### **2. Principle Name**

[Description]

---

## 🚨 Boundary Violations

[How to detect and fix]

---

## 🔍 Checking Boundaries

```bash
# Commands to verify
```

---

## 📚 Related Documents

- `FILE.md` — Description
- `OTHER.md` — Description

---

**Last Updated:** [Date] - [Summary of changes]
```

### Template 2: Contract Document

```markdown
# [Feature] Contract

**Status:** ✅ [Status]  
**Last Updated:** [Date]

[Brief description]

---

## 🔒 **THE GOLDEN RULE**

**[Core invariant in bold]**

❌ **NEVER** [anti-pattern]  
✅ **ALWAYS** [correct pattern]

---

## 📚 **The [N] [Thing] Functions**

### 1️⃣ `functionName()` - Purpose

**Use when:** [scenario]

```typescript
// ✅ Example usage
```

**What it does:**

- ✅ [benefit]
- ✅ [benefit]
- ❌ [what it doesn't do]

---

## ❌ **ANTI-PATTERNS (DO NOT USE)**

### ❌ Pattern Name

```typescript
// ❌ BAD: [reason]
[bad code]

// ✅ GOOD: [reason]
[good code]
```

**Why this is wrong:**

- [reason]
- [reason]

---

## 🔍 **Function Decision Tree**

```
Question?
│
├─ Option A
│  └─ Use X ✅
│
└─ Option B
   └─ Use Y ✅
```

---

## 🧪 **Enforcement Layers**

### 1️⃣ Layer Name

- [mechanism]

---

## 📊 **Common Scenarios**

### Scenario 1: [Name]

```typescript
// ❌ OLD (Before fixes)
[old code]

// ✅ NEW (After fixes)
[new code]
```

---

## ✅ **Verification Checklist**

When reviewing [thing], verify:

- [ ] Check 1
- [ ] Check 2

---

## 🎯 **Summary**

| Goal | Function | When |
|------|----------|------|
| [goal] | `func()` | [scenario] |

---

**Questions?** See `path/to/file.ts` for detailed implementation.
```

### Template 3: Component/Feature Guide

```markdown
# [Feature] Architecture

[Introduction]

## Table of Contents

- [Section](#section)
- [Section](#section)

---

## Overview

[Description with ASCII diagram]

**Key Principles:**

1. **Principle** - Description
2. **Principle** - Description

---

## Core Architectural Principle: [Most Important Rule]

### [Principle Statement]

**[Layer]** does [responsibility]:

- [detail]
- [detail]

**[Layer]** does [different responsibility]:

- [detail]
- [detail]

### Example: [Component Name]

**❌ Wrong ([Why]):**

```typescript
// Component doing X
[bad code with inline comments explaining why it's wrong]
```

**✅ Correct ([Why]):**

```typescript
// Component doing Y correctly
[good code with inline comments]
```

**Why This Matters:**

1. **Benefit** - Description
2. **Benefit** - Description

---

## Component Hierarchy

### Layer Name

#### **ComponentName**

**Location:** `path/to/file.tsx`

**Responsibility:** [One-sentence description]

**What it does:**

- [responsibility]
- [responsibility]

**What it does NOT do:**

- [anti-responsibility]
- [anti-responsibility]

```typescript
// Usage example
```

---

## Component Responsibilities

### Clear Ownership Table

| Concern | Owner | Location |
|---------|-------|----------|
| **Thing** | Component | Layer |
| **Thing** | Component | Layer |

---

## Usage Patterns

### Pattern 1: [Name]

```typescript
// Complete example
```

---

## Interaction Patterns

### [Interaction] Handling

**Architecture:**

- [description]

**Best Practice:**

```typescript
// Recommended approach
```

**Anti-Pattern:** ❌

```typescript
// DON'T do this
```

---

## Testing

### Automated Tests

**Location:** `path/to/tests/`

1. **file.test.ts** - [N] tests
   - [area]
   - [area]

**Run tests:**

```bash
npm run test:run
```

---

### Manual Testing Checklist

**For any new [thing]:**

#### Category

- [ ] Check 1
- [ ] Check 2

---

## Migration Guide

### Migrating Existing Components

**Before:**

```typescript
// Old: [description]
[old code]
```

**After:**

```typescript
// New: [description]
[new code]
```

**Benefits:**

- ~[N] lines → ~[N] lines
- [benefit]

---

### Step-by-Step Migration

1. **Step name:**
   - [action]

---

## Best Practices

### ✅ Do

1. **Practice name**

   ```typescript
   // Example
   ```

### ❌ Don't

1. **Anti-pattern name**

   ```typescript
   // Bad example
   ```

---

## Future Considerations

### Potential Enhancements

1. **Feature name**
   - [description]

---

## Related Documentation

- [FILE.md](./FILE.md) - Description

---

## Change Log

**[Date] (Updated)** - [Summary]

**Phase 1: [Name]**

- [change]
- [change]

**Key Learnings:**

- [insight]
- [insight]
```

---

## Code Example Patterns

### Pattern: Before/After Comparison

```markdown
### Scenario: [Name]

```typescript
// ❌ OLD (Before fixes)
const bad = oldWay();

// ✅ NEW (After fixes)
const good = newWay();
```
```

### Pattern: Anti-Pattern with Explanation

```markdown
### ❌ [Anti-Pattern Name]

```typescript
// ❌ BAD: [Reason why it's wrong]
badCode();

// ❌ BAD: [Another reason]
moreeBadCode();
```

**Why this is wrong:**

- [technical reason]
- [architectural reason]
- [consequence]

**The fix:**

```typescript
// ✅ GOOD: [Why this is correct]
goodCode();
```
```

### Pattern: Decision Tree

Use ASCII art for decision paths:

```markdown
## 🔍 **Function Decision Tree**

```
Are you creating NEW or updating EXISTING?
│
├─ NEW BLOCK
│  │
│  ├─ Know type at compile time?
│  │  ├─ YES → Use createBlockNode() ✅
│  │  └─ NO → Use createCleanBlockAttrs() ✅
│  │
│  └─ Have source block to clone?
│     ├─ YES → Use createCleanBlockAttrs() ✅
│     └─ NO → Use createBlockNode() ✅
│
└─ EXISTING BLOCK
   └─ Use updateBlockAttrs() ✅
```
```

### Pattern: Responsibility Table

```markdown
| Concern | Owner | Location |
|---------|-------|----------|
| **Portal rendering** | FloatingContainer | Foundation |
| **ESC dismissal** | FloatingMenu | Foundation |
| **Arrow key navigation** | Plugin (editor) | Application |
```

### Pattern: ASCII Diagrams

```markdown
```
┌─────────────────────────────────────────────┐
│  Layer Name                                  │
│  (Components)                                │
│  - Responsibility                            │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  Layer Name                                  │
└─────────────────────────────────────────────┘
```
```

---

## Writing Style Rules

### 1. Use Active Voice

```markdown
✅ "FloatingMenu handles ESC key dismissal"
❌ "ESC key dismissal is handled by FloatingMenu"
```

### 2. Be Specific

```markdown
✅ "Generates new blockId using crypto.randomUUID()"
❌ "Creates an ID"
```

### 3. Use "Must" for Requirements

```markdown
✅ "Components MUST NOT manipulate transactions directly"
❌ "Components should avoid manipulating transactions"
```

### 4. Lead with the Rule, Then Explain

```markdown
✅ "Chrome is NOT inside contenteditable. This ensures cursor semantics remain clear."
❌ "Cursor semantics can be confusing, so chrome shouldn't be in contenteditable."
```

### 5. Use Inline Comments in Code Examples

```markdown
```typescript
const bad = doSomething(); // ❌ Creates temporal identity gap
const good = doItRight(); // ✅ Eagerly assigns blockId
```
```

---

## Section Organization

### Required Sections (Architecture Docs)

1. **Title with category** (`# Feature - Architecture`)
2. **Overview** with diagram
3. **Core principles** or boundaries
4. **Component/function reference**
5. **Usage patterns** or scenarios
6. **Anti-patterns** (if applicable)
7. **Related documents**
8. **Last updated** date

### Required Sections (Contract Docs)

1. **Status badge** at top
2. **The Golden Rule** section
3. **Function/API reference** (numbered)
4. **Anti-patterns** section
5. **Decision tree** or checklist
6. **Enforcement layers**
7. **Common scenarios**
8. **Verification checklist**
9. **Summary table**

### Required Sections (Guide Docs)

1. **Table of contents**
2. **Overview** with principles
3. **Component hierarchy**
4. **Usage patterns**
5. **Testing** (automated + manual)
6. **Migration guide** (if replacing old code)
7. **Best practices** (Do/Don't)
8. **Related documentation**
9. **Change log**

---

## Consistency Rules

### File Naming

```markdown
✅ ARCHITECTURE.md (all caps for major docs)
✅ BLOCK_CREATION_CONTRACT.md (all caps)
✅ FLOATING_UI_ARCHITECTURE.md (all caps)
✅ KNOWN_ISSUES.md (all caps)
✅ README.md (standard)
❌ Architecture.md (mixed case for top-level)
```

### Emoji Usage

Only use emojis in section headers, not in body text:

```markdown
✅ ## 🔒 Architectural Boundaries
   
   This section describes boundaries...

❌ The boundaries 🔒 are enforced by...
```

### Code Block Language Tags

Always specify language for syntax highlighting:

```markdown
✅ ```typescript
✅ ```bash
✅ ```markdown
✅ ```json
❌ ``` (no language)
```

### Link Format

```markdown
✅ See [ARCHITECTURE.md](./ARCHITECTURE.md) for details
✅ Located at `packages/editor/domain/createBlock.ts`
❌ See ARCHITECTURE.md (no link)
```

---

## Quality Checklist

Before finalizing documentation, verify:

### Structure
- [ ] Has status badge (if contract/enforcement doc)
- [ ] Has last updated date
- [ ] Has table of contents (if >5 sections)
- [ ] Has related documents section
- [ ] Sections are in logical order

### Content
- [ ] Golden Rule is prominent (if applicable)
- [ ] Anti-patterns clearly marked with ❌
- [ ] Correct patterns clearly marked with ✅
- [ ] Code examples are complete and tested
- [ ] All claims have supporting evidence

### Style
- [ ] Emojis used in headers only
- [ ] Active voice throughout
- [ ] Specific, not vague
- [ ] No unexplained jargon
- [ ] Consistent terminology

### Technical
- [ ] File paths are correct
- [ ] Code examples compile/run
- [ ] Links work
- [ ] Commands tested
- [ ] Inline comments explain "why"

---

## Common Patterns in Clutter Docs

### 1. Enforcement Documentation

When documenting architectural rules:

```markdown
## 🧪 **Enforcement Layers**

### 1️⃣ TypeScript Types

- [mechanism]

### 2️⃣ Runtime Validation

- [mechanism]

### 3️⃣ ESLint Rules

- [mechanism]

### 4️⃣ Code Review

- [checklist item]
```

### 2. Component Documentation

When documenting UI components:

```markdown
#### **ComponentName**

**Location:** `path/to/file.tsx`

**Responsibility:** [one sentence]

**What it does:**

- ✅ [responsibility]
- ✅ [responsibility]

**What it does NOT do:**

- ❌ [anti-responsibility]
- ❌ [anti-responsibility]

```typescript
// Usage example
```
```

### 3. Migration Documentation

When documenting code changes:

```markdown
### Step-by-Step Migration

1. **Replace X:**
   - Remove Y
   - Add Z

2. **Update Y:**
   - Change A to B
   
3. **Test thoroughly:**
   - Run automated tests
   - Complete manual testing checklist
```

---

## Examples from Clutter Codebase

### Example 1: Clear Boundary Definition

From `ARCHITECTURE.md`:

```markdown
### 4️⃣ **editor** — Isolated Editor Engine

- **Can import from:** ✅ ui (presentational primitives only)
- **Cannot import from:** ❌ domain, state, shared
- **Purpose:** TipTap-based editor with plugins
- **Status:** ✅ **Fully isolated from app logic**
```

### Example 2: The Golden Rule Pattern

From `BLOCK_CREATION_CONTRACT.md`:

```markdown
## 🔒 **THE GOLDEN RULE**

**ALL block creation MUST go through centralized creation functions.**

❌ **NEVER** call `schema.nodes.X.create()` directly  
✅ **ALWAYS** use `createBlockNode()` or `createCleanBlockAttrs()`
```

### Example 3: Before/After with Line Count

From `FLOATING_UI_ARCHITECTURE.md`:

```markdown
**Benefits:**

- ~150 lines → ~30 lines
- All interaction modes handled automatically
- Consistent UX across all menus
- Easier to maintain and test
```

---

## When to Create Each Document Type

| Document Type | When to Create |
|--------------|----------------|
| **ARCHITECTURE.md** | New package, major refactor, establishing boundaries |
| **[FEATURE]_CONTRACT.md** | Enforcing invariants, preventing anti-patterns |
| **[FEATURE]_ARCHITECTURE.md** | Complex component system, multiple layers |
| **[FEATURE]_GUIDE.md** | Step-by-step workflow, migration path |
| **[FEATURE]_TESTS.md** | Testing strategy, manual checklist |
| **KNOWN_ISSUES.md** | Tracking technical debt |
| **IMPLEMENTATION_SUMMARY.md** | Recording decision history |

---

## Summary

**Core Documentation Values:**

1. **Scannable** - Visual hierarchy with emojis, tables, diagrams
2. **Actionable** - Checklists, decision trees, step-by-step guides
3. **Enforcement-focused** - Golden rules, anti-patterns, verification
4. **Example-driven** - Before/after, usage patterns, scenarios
5. **Maintained** - Status badges, timestamps, change logs

**Key Pattern:**

```
Rule → Explanation → Example → Anti-pattern → Verification
```

