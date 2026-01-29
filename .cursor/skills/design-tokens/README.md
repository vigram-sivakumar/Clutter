# Design Token Enforcement Skill

This skill teaches the AI agent to enforce the use of centralized design tokens instead of hardcoded values in the Clutter Notes codebase.

## Overview

**Purpose:** Ensure all design values (colors, spacing, typography, sizing) come from the centralized token system to maintain consistency, enable theming, and prevent design system drift.

**Token Sources:**

- **Colors**: `@clutter/ui/tokens/colors` - Theme-aware color palette (light/dark modes)
- **Editor Design**: `@clutter/editor/tokens` - Spacing, typography, sizing, patterns

## Files in This Skill

### SKILL.md (Main Instructions)

The primary skill file loaded by the agent. Contains:

- Quick reference for common token usage patterns
- Rules for what to avoid (hardcoded colors, magic numbers)
- Exception scenarios and how to document them
- Migration patterns for replacing hardcoded values
- Review checklist for code reviews

**When to read:** The agent automatically reads this when working on UI components, styling, or reviewing code with design values.

### examples.md (Migration Reference)

Real-world examples of migrating hardcoded values to tokens, drawn from actual Clutter codebase patterns.

**When to read:** When fixing violations or migrating existing code to use tokens.

**Contains:**

- 8 detailed migration examples
- Before/after comparisons
- Exception documentation patterns
- Quick reference table for common migrations
- Guide for adding new tokens

### SETUP.md (Enablement Guide)

Instructions for enabling the ESLint rule that automatically detects violations.

**When to read:** When setting up the project or enabling automated enforcement.

**Contains:**

- Two enablement options (ESLint 9+ or eslint-plugin-local)
- Gradual rollout strategy (warning → error)
- Troubleshooting guide
- Testing instructions

## Automated Enforcement

### ESLint Rule: `use-design-tokens`

**Location:** `.eslint-local/rules/use-design-tokens.js`

**Detects:**

- ✅ Hex colors: `#fff`, `#131210`
- ✅ RGB/RGBA: `rgb(...)`, `rgba(...)`
- ✅ Magic number spacing: `padding: 8`, `margin: 16`
- ✅ Hardcoded font sizes: `fontSize: 16`
- ✅ Arbitrary z-index: `zIndex: 1000`

**Status:** Implemented and ready, awaiting ESLint 9+ or eslint-plugin-local installation.

## Quick Start for Developers

### Using the Skill

1. **Creating new components:**

   ```tsx
   import { useTheme } from '@clutter/shared';
   import { colors } from '@clutter/ui/tokens/colors';
   import { spacing, typography } from '@clutter/editor/tokens';

   const theme = useTheme();
   const c = colors[theme.mode];
   ```

2. **Common patterns:**
   - Text color: `c.text.default`
   - Background: `c.background.default`
   - Spacing: `spacing['8']`, `spacing['16']`
   - Font size: `typography.body`

3. **When migrating code:**
   - See [examples.md](examples.md) for patterns
   - Add exceptions with comments when needed
   - Test both light and dark themes

### For the AI Agent

When you see hardcoded design values in code:

1. **Identify the token category**: color, spacing, typography, sizing
2. **Find the appropriate token**: Reference SKILL.md quick lookup table
3. **Replace with token usage**: Follow the migration patterns in examples.md
4. **Document exceptions**: Use ESLint disable comments with justification
5. **Verify theme support**: Ensure it works in both light and dark modes

## Architecture Integration

This skill is part of Clutter's broader architectural enforcement:

- **Block Creation Contract**: `no-manual-block-create` rule
- **Keyboard Safety**: `require-ui-safety-wrapper` rule
- **Design Tokens**: `use-design-tokens` rule (this skill)

All rules follow the same pattern:

1. Clear architectural contract
2. Documented in code and markdown
3. Enforced via custom ESLint rules
4. Agent skill for AI-assisted enforcement

## Maintenance

### Adding New Tokens

When adding new design tokens:

1. **Update token files:**
   - Colors → `packages/ui/src/tokens/colors.ts`
   - Other values → `packages/editor/tokens.ts`

2. **Update SKILL.md:**
   - Add to "Available color tokens" or "Editor Tokens" section
   - Add to "Common Token Lookups" table if frequently used

3. **Update examples.md:**
   - Add example if it's a new pattern
   - Update quick reference table

### Updating the ESLint Rule

If token patterns change or new violations need detection:

1. **Update rule:** `.eslint-local/rules/use-design-tokens.js`
2. **Test changes:** `.eslint-local/TEST_RULE.md` has test examples
3. **Update docs:** Both SKILL.md and `.eslint-local/README.md`

## Related Documentation

- **Token definitions:** [packages/ui/src/tokens/colors.ts](../../packages/ui/src/tokens/colors.ts)
- **Editor tokens:** [packages/editor/tokens.ts](../../packages/editor/tokens.ts)
- **ESLint rules:** [.eslint-local/README.md](../../.eslint-local/README.md)
- **ESLint rule tests:** [.eslint-local/TEST_RULE.md](../../.eslint-local/TEST_RULE.md)

## Success Criteria

This skill is successful when:

- ✅ New components consistently use design tokens
- ✅ Hardcoded values are rare and well-documented
- ✅ Theme switching works seamlessly (no visual glitches)
- ✅ ESLint catches violations automatically
- ✅ Agent can fix violations without human guidance
- ✅ Design system changes propagate automatically through tokens
