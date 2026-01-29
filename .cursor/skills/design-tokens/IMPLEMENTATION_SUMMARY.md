# Design Token Enforcement - Implementation Summary

**Created:** January 26, 2026  
**Purpose:** Enforce use of centralized design tokens instead of hardcoded values

## What Was Built

### 1. Cursor Agent Skill (AI Guidance)

**Location:** `.cursor/skills/design-tokens/`

A comprehensive skill that teaches the AI agent to:

- Detect hardcoded design values (colors, spacing, typography, sizing)
- Replace them with appropriate design tokens
- Document exceptions appropriately
- Guide developers through migration

**Files Created:**

| File          | Purpose                              | Lines |
| ------------- | ------------------------------------ | ----- |
| `SKILL.md`    | Main instructions for the agent      | 230   |
| `examples.md` | Real-world migration patterns        | 350   |
| `SETUP.md`    | ESLint rule enablement guide         | 150   |
| `README.md`   | Skill overview and maintenance guide | 160   |

### 2. ESLint Rule (Automated Enforcement)

**Location:** `.eslint-local/rules/use-design-tokens.js`

Custom ESLint rule that automatically detects:

✅ **Hardcoded Colors**

- Hex: `#fff`, `#131210`, `#f0f0f0`
- RGB: `rgb(250, 250, 248)`
- RGBA: `rgba(37, 36, 32, 0.5)`

✅ **Magic Number Spacing**

- Numeric literals: `padding: 8`, `margin: 16`
- String numbers: `'8px'`, `'16px'`
- All spacing properties: padding, margin, gap, width, height

✅ **Hardcoded Typography**

- Font sizes: `fontSize: 16`, `fontSize: '32px'`
- (Font weight and line height checked via spacing rules)

✅ **Arbitrary Z-Index**

- Direct numbers: `zIndex: 1000`, `zIndex: 9999`

**Detection Patterns:**

- JSX inline styles: `<div style={{ color: '#fff' }} />`
- Object literals: `const styles = { color: '#fff' }`
- Template literals: ``style={{ color: `#${hex}` }}``

**Exception Handling:**

```tsx
// eslint-disable-next-line use-design-tokens
// JUSTIFICATION: Reason for exception
<div style={{ color: '#FF5F57' }}>
```

### 3. Documentation Updates

**Updated Files:**

1. **`.eslint-local/README.md`**
   - Added `use-design-tokens` rule documentation
   - Updated enablement examples to include new rule
   - Added to both ESLint 9+ and eslint-plugin-local examples

2. **`.eslint-local/TEST_RULE.md`**
   - Added test cases for the new rule
   - Includes both violation examples and correct patterns
   - Shows expected ESLint output

3. **`.eslint-local/rules/index.js`**
   - Registered the new rule in the rules export
   - Now exports all three custom rules

## Token System Architecture

### Color Tokens

**Source:** `packages/ui/src/tokens/colors.ts`

Two themes (light and dark) with semantic naming:

```typescript
colors[theme.mode].text.default; // Primary text
colors[theme.mode].background.default; // Primary background
colors[theme.mode].border.subtle; // Subtle borders
colors[theme.mode].semantic.success; // Success state
```

**Categories:**

- `background.*` - Surfaces and containers
- `text.*` - Text hierarchy
- `border.*` - Lines and dividers
- `accent.*` - Tags and highlights
- `semantic.*` - Status colors
- `button.*` - Button states
- `overlay.*` - Interaction overlays
- `shadow.*` - Depth and elevation

### Editor Tokens

**Source:** `packages/editor/tokens.ts`

Design constants for the editor:

```typescript
spacing.block      // 8px - block gap
spacing.indent     // 32px - nesting indent
typography.body    // 16px - body text
sizing.icon        // 16px - icon size
sizing.zIndex.*    // Layering scale
```

## Migration Path

### Current Status

⚠️ **ESLint Rule Status:** Implemented but not yet enabled

- Requires ESLint 9+ or `eslint-plugin-local` package
- See `SETUP.md` for enablement instructions

✅ **Immediate Value:** Agent skill works now

- Catches violations in code reviews
- Suggests correct token usage
- Guides through migrations

### Recommended Rollout

**Phase 1: Agent-Assisted (Current)**

- Agent detects violations during code review
- Suggests fixes using the skill
- Manual acceptance/editing

**Phase 2: Warning Mode**

```javascript
rules: {
  'editor/use-design-tokens': 'warn',
}
```

- ESLint highlights violations (doesn't block)
- Fix critical paths first

**Phase 3: Full Enforcement**

```javascript
rules: {
  'editor/use-design-tokens': 'error',
}
```

- Violations block builds
- Prevents new hardcoded values

## Files with Existing Violations

Based on the grep search, these files have hardcoded values:

### High Priority (UI Components)

1. **`packages/editor/components/shared/EditorErrorFallback.tsx`**
   - 11 hardcoded colors
   - **Exception justified:** Error fallback UI (theme system may be crashed)

2. **`packages/editor/components/chrome/BlockSelectionHalo.tsx`**
   - 1 RGBA selection color
   - **Should migrate:** Add selection color to semantic tokens

3. **`packages/editor/tokens.ts`**
   - 2 colors in `editorColors` constant
   - **Status:** These ARE tokens (defined here), not violations

### Low Priority (System UI)

4. **`packages/ui/src/components/app-layout/layout/sidebar/internal/WindowControls.tsx`**
   - 3 colors (macOS traffic lights)
   - **Exception justified:** OS standard colors

## Usage Examples

### Example 1: New Component

```tsx
import { useTheme } from '@clutter/shared';
import { colors } from '@clutter/ui/tokens/colors';
import { spacing, typography } from '@clutter/editor/tokens';

function MyComponent() {
  const theme = useTheme();
  const c = colors[theme.mode];

  return (
    <div
      style={{
        color: c.text.default,
        backgroundColor: c.background.default,
        padding: spacing['16'],
        fontSize: typography.body,
      }}
    >
      Hello World
    </div>
  );
}
```

### Example 2: Migrating Existing Code

**Before:**

```tsx
<Card
  style={{
    background: '#fafaf8',
    border: '1px solid #ecece6',
    padding: 16,
  }}
/>
```

**After:**

```tsx
const theme = useTheme();
const c = colors[theme.mode];

<Card
  style={{
    background: c.background.default,
    border: `1px solid ${c.border.subtle}`,
    padding: spacing['16'],
  }}
/>;
```

## Testing

### Manual Testing

See `examples.md` for migration patterns and `.eslint-local/TEST_RULE.md` for test cases.

### Automated Testing (Once ESLint Rule Enabled)

```bash
# Find violations
npm run lint

# Example output:
# EditorErrorFallback.tsx:22  error  Avoid hardcoded color "#fafaf8"
```

## Success Metrics

The skill is working well when:

- [ ] Agent consistently detects hardcoded values in code review
- [ ] Suggestions use correct token paths
- [ ] Exception documentation is clear and justified
- [ ] Theme switching works without visual glitches
- [ ] New components use tokens by default

Once ESLint rule is enabled:

- [ ] CI catches violations before merge
- [ ] Violations decrease over time
- [ ] New violations are rare (<1 per month)

## Maintenance

### When to Update This Skill

1. **New token categories added**
   - Update SKILL.md token lists
   - Update examples.md with usage patterns
   - Consider updating ESLint rule detection

2. **Token structure changes**
   - Update all file path references
   - Update code examples
   - Update quick reference tables

3. **New exception scenarios identified**
   - Document in SKILL.md
   - Add example to examples.md
   - Add test case to TEST_RULE.md

### Files to Update

| Change Type          | Files to Update                                         |
| -------------------- | ------------------------------------------------------- |
| New token added      | `SKILL.md` (token list), `examples.md` (if new pattern) |
| Token path changed   | All skill files, ESLint rule                            |
| New exception type   | `SKILL.md`, `examples.md`, `SETUP.md`                   |
| ESLint rule behavior | `use-design-tokens.js`, `TEST_RULE.md`, `README.md`     |

## Integration with Other Skills

This skill complements existing architectural enforcement:

- **`editor-architecture` skill**: Enforces block creation, chrome overlay patterns
- **`no-manual-block-create` rule**: Prevents identity gaps in blocks
- **`require-ui-safety-wrapper` rule**: Ensures keyboard safety
- **`design-tokens` skill** (this): Ensures design system consistency

All follow the same pattern:

1. Clear contract documented in markdown
2. Custom ESLint rule for automation
3. Agent skill for AI-assisted enforcement
4. Progressive disclosure (main docs → detailed examples)

## Next Steps

### For Developers

1. **Read `SKILL.md`** - Understand the patterns
2. **Review `examples.md`** - See migration examples
3. **Use tokens in new code** - Make it a habit
4. **Document exceptions** - When hardcoding is necessary

### For Enabling Enforcement

1. **Read `SETUP.md`** - Choose ESLint enablement path
2. **Start in warning mode** - See current violations
3. **Fix high-priority violations** - UI components first
4. **Switch to error mode** - Block new violations
5. **Add to CI** - Prevent regressions

## Summary

This implementation provides:

✅ **AI-Assisted Detection** - Agent skill catches violations during code review  
✅ **Automated Enforcement** - ESLint rule (ready to enable)  
✅ **Clear Migration Path** - Detailed examples from real codebase  
✅ **Exception Handling** - Documented patterns for legitimate cases  
✅ **Complete Documentation** - For developers, maintainers, and AI agent

**Total Files Created:** 7  
**Total Lines of Documentation:** ~1,100  
**ESLint Rule Lines:** ~250

The skill is **ready to use immediately** for AI-assisted enforcement, and the ESLint rule is **ready to enable** once ESLint 9+ or eslint-plugin-local is installed.
