---
name: design-tokens
description: Enforce use of design tokens from colors.ts and tokens.ts instead of hardcoded values. Use when writing UI components, styling elements, or reviewing code that contains colors, spacing, typography, or other design values. Detects hardcoded hex colors, rgb() values, magic numbers for spacing, font sizes, and other design constants.
---

# Design Token Enforcement

## Overview

All design values (colors, spacing, typography, sizing) must use centralized design tokens. Hardcoded values create inconsistencies, make theming impossible, and violate the design system architecture.

## Token Sources

### Color Tokens: `@clutter/ui/tokens/colors`

```typescript
import { colors } from '@clutter/ui/tokens/colors';
import { useTheme } from '@clutter/shared';

const theme = useTheme();
const textColor = colors[theme.mode].text.default;
```

**Available color tokens:**

- `background.*` - default, secondary, tertiary, hover, active
- `text.*` - default, secondary, tertiary, disabled, placeholder, inverse
- `border.*` - default, subtle, focus, divider
- `accent.*` - gold, default, gray, brown, orange, yellow, green, purple, pink, red
- `semantic.*` - success, warning, error, info, orange, calendarAccent
- `button.primary.*` - background, backgroundHover, backgroundActive, text
- `button.danger.*` - background, backgroundHover, text
- `overlay.*` - soft, medium, default, strong, backdrop
- `shadow.*` - sm, md, lg

### Editor Tokens: `@clutter/editor/tokens`

```typescript
import {
  spacing,
  sizing,
  typography,
  editorColors,
  patterns,
} from '@clutter/editor/tokens';

// Spacing
const blockGap = spacing.block; // 8px
const indentWidth = spacing.indent; // 32px

// Typography
const bodySize = typography.body; // 16px
const fontStack = typography.fontFamily;

// Sizing
const iconSize = sizing.icon; // 16px
const borderRadius = sizing.radius.md; // 4px
const zIndex = sizing.zIndex.modal; // 1050

// Editor-specific colors
const dividerColor = editorColors.divider.light;
```

## Rules

### 1. No Hardcoded Colors

❌ **Bad:**

```typescript
<div style={{ color: '#131210', background: 'rgb(250, 250, 248)' }}>
<div style={{ borderColor: 'rgba(37, 36, 32, 0.5)' }}>
```

✅ **Good:**

```typescript
const theme = useTheme();
<div style={{
  color: colors[theme.mode].text.default,
  background: colors[theme.mode].background.default
}}>
```

### 2. No Magic Number Spacing

❌ **Bad:**

```typescript
<div style={{ padding: '8px', margin: '16px' }}>
<div style={{ gap: 12 }}>
```

✅ **Good:**

```typescript
import { spacing } from '@clutter/editor/tokens';

<div style={{ padding: spacing['8'], margin: spacing['16'] }}>
<div style={{ gap: spacing['12'] }}>
```

### 3. No Hardcoded Typography

❌ **Bad:**

```typescript
<h1 style={{ fontSize: '32px', fontWeight: 700 }}>
<p style={{ fontSize: '16px', lineHeight: 1.5 }}>
```

✅ **Good:**

```typescript
import { typography } from '@clutter/editor/tokens';

<h1 style={{ fontSize: typography.h1, fontWeight: typography.weight.bold }}>
<p style={{ fontSize: typography.body, lineHeight: typography.lineHeightRatio }}>
```

### 4. No Hardcoded Z-Index

❌ **Bad:**

```typescript
<div style={{ zIndex: 1000 }}>
<div style={{ zIndex: 9999 }}>
```

✅ **Good:**

```typescript
import { sizing } from '@clutter/editor/tokens';

<div style={{ zIndex: sizing.zIndex.dropdown }}>
<div style={{ zIndex: sizing.zIndex.modal }}>
```

## Exceptions

### Error Fallbacks

Error boundaries may use inline styles as fallback when theme system is unavailable:

```typescript
// EditorErrorFallback.tsx - fallback UI when React crashes
// eslint-disable-next-line use-design-tokens
<div style={{ backgroundColor: '#fafaf8' }}>
```

### SVG Fill/Stroke Colors

SVG colors passed as props may be hardcoded when they're not theme-dependent:

```typescript
// WindowControls.tsx - macOS window control colors (system standard)
// eslint-disable-next-line use-design-tokens
<Circle color="#FF5F57" /> // Red close button
```

### Third-Party Component Props

Some libraries require color strings directly:

```typescript
// eslint-disable-next-line use-design-tokens
<Chart colors={['#FF8C00', '#059669']} />
```

## Migration Patterns

### Replacing Hardcoded Colors

**Before:**

```typescript
<div style={{ color: '#131210', backgroundColor: '#fafaf8' }}>
```

**After:**

```typescript
const theme = useTheme();

<div style={{
  color: colors[theme.mode].text.default,
  backgroundColor: colors[theme.mode].background.default
}}>
```

### Replacing Magic Numbers

**Before:**

```typescript
<div style={{ padding: 8, marginTop: 16, gap: 12 }}>
```

**After:**

```typescript
import { spacing } from '@clutter/editor/tokens';

<div style={{
  padding: spacing['8'],
  marginTop: spacing['16'],
  gap: spacing['12']
}}>
```

### Creating New Tokens

If you need a value that doesn't exist:

1. **Identify the category**: color, spacing, typography, sizing
2. **Add to appropriate token file**:
   - Colors → `packages/ui/src/tokens/colors.ts`
   - Editor values → `packages/editor/tokens.ts`
3. **Use semantic naming**: `buttonHover`, not `gray300`
4. **Support both themes**: Add light and dark mode values

## Automated Enforcement

### ESLint Rule: `use-design-tokens`

Detects hardcoded design values in code:

```bash
# Run ESLint to check for violations
npm run lint

# Auto-fix where possible (won't fix all cases)
npm run lint:fix
```

**Detected patterns:**

- Hex colors: `#fff`, `#131210`
- RGB/RGBA: `rgb(255, 255, 255)`, `rgba(0, 0, 0, 0.5)`
- Magic numbers in style props: `padding: 8`, `fontSize: 16`
- Direct z-index values: `zIndex: 1000`

**Exception syntax:**

```typescript
// eslint-disable-next-line use-design-tokens
<div style={{ color: '#FF5F57' }}>
```

## Review Checklist

When reviewing code for token usage:

- [ ] No hex colors (`#`) in styles
- [ ] No `rgb()` or `rgba()` functions
- [ ] No magic numbers for spacing/sizing
- [ ] No hardcoded font sizes
- [ ] No arbitrary z-index values
- [ ] Theme-aware colors using `useTheme()`
- [ ] Tokens imported from correct package
- [ ] Exceptions are documented with ESLint disable comments

## Common Token Lookups

| Need           | Token Path                              |
| -------------- | --------------------------------------- |
| Text color     | `colors[theme.mode].text.default`       |
| Background     | `colors[theme.mode].background.default` |
| Border         | `colors[theme.mode].border.default`     |
| Hover state    | `colors[theme.mode].background.hover`   |
| Block spacing  | `spacing.block` (8px)                   |
| Indent width   | `spacing.indent` (32px)                 |
| Body font size | `typography.body` (16px)                |
| Icon size      | `sizing.icon` (16px)                    |
| Border radius  | `sizing.radius.md` (4px)                |
| Modal z-index  | `sizing.zIndex.modal` (1050)            |

## Additional Resources

- **Migration examples**: See [examples.md](examples.md) for real-world migration patterns
- **ESLint rule documentation**: [.eslint-local/README.md](../../.eslint-local/README.md)
- **Token definitions**: [packages/ui/src/tokens/colors.ts](../../packages/ui/src/tokens/colors.ts)
- **Editor tokens**: [packages/editor/tokens.ts](../../packages/editor/tokens.ts)
- **Theme hook**: [packages/shared/src/hooks/useTheme.ts](../../packages/shared/src/hooks/useTheme.ts)
