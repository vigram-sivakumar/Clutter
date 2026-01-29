# Design Token Migration Examples

Real-world examples of migrating hardcoded values to design tokens from the Clutter codebase.

## Example 1: EditorErrorFallback (Error Boundary UI)

### Before (Hardcoded)

```tsx
<div
  style={{
    backgroundColor: '#fafaf8',
    border: '1px solid #ecece6',
    color: '#131210',
  }}
>
  <h2 style={{ color: '#5c5b52' }}>Error</h2>
  <pre style={{ backgroundColor: '#f5f5f0', color: '#5c5b52' }}>
    {error.message}
  </pre>
</div>
```

### After (Using Tokens)

```tsx
import { useTheme } from '@clutter/shared';
import { colors } from '@clutter/ui/tokens/colors';

function EditorErrorFallback({ error }) {
  const theme = useTheme();
  const c = colors[theme.mode];

  return (
    <div
      style={{
        backgroundColor: c.background.default,
        border: `1px solid ${c.border.subtle}`,
        color: c.text.default,
      }}
    >
      <h2 style={{ color: c.text.secondary }}>Error</h2>
      <pre
        style={{
          backgroundColor: c.background.secondary,
          color: c.text.secondary,
        }}
      >
        {error.message}
      </pre>
    </div>
  );
}
```

**Note:** Error boundaries may keep inline fallback styles as a safety mechanism if the theme system itself crashes. In that case, add an exception comment:

```tsx
// eslint-disable-next-line use-design-tokens
// JUSTIFICATION: Error fallback when theme system is unavailable
<div style={{ backgroundColor: '#fafaf8' }}>
```

## Example 2: BlockSelectionHalo (Transparent Colors)

### Before (Hardcoded RGBA)

```tsx
<div
  style={{
    background: 'rgba(35, 131, 226, 0.14)',
    borderRadius: '4px',
  }}
/>
```

### After (Using Tokens)

```tsx
import { useTheme } from '@clutter/shared';
import { colors } from '@clutter/ui/tokens/colors';
import { sizing } from '@clutter/editor/tokens';

function BlockSelectionHalo() {
  const theme = useTheme();

  return (
    <div
      style={{
        // For selection, use semantic info color with overlay
        background: colors[theme.mode].semantic.info,
        opacity: 0.14,
        borderRadius: sizing.radius.md,
      }}
    />
  );
}
```

**Alternative:** If this is a common pattern, add it to the token system:

```typescript
// In colors.ts, add to semantic section:
semantic: {
  selection: 'rgba(35, 131, 226, 0.14)',
}
```

## Example 3: WindowControls (System Colors)

### Before (Hardcoded SVG Colors)

```tsx
function WindowControls() {
  return (
    <>
      <Circle color="#FF5F57" /> {/* Red */}
      <Circle color="#FEBC2E" /> {/* Yellow */}
      <Circle color="#28C840" /> {/* Green */}
    </>
  );
}
```

### After (Exception for System UI)

```tsx
function WindowControls() {
  // These are macOS system standard colors - not theme-dependent
  return (
    <>
      {/* eslint-disable-next-line use-design-tokens */}
      {/* System standard: macOS window control red */}
      <Circle color="#FF5F57" />

      {/* eslint-disable-next-line use-design-tokens */}
      {/* System standard: macOS window control yellow */}
      <Circle color="#FEBC2E" />

      {/* eslint-disable-next-line use-design-tokens */}
      {/* System standard: macOS window control green */}
      <Circle color="#28C840" />
    </>
  );
}
```

**Rationale:** macOS traffic light colors are OS standards and shouldn't change with themes.

## Example 4: Spacing & Typography

### Before (Magic Numbers)

```tsx
<div
  style={{
    padding: '8px',
    marginTop: 16,
    gap: 12,
    fontSize: '16px',
    lineHeight: 1.5,
    fontWeight: 600,
  }}
/>
```

### After (Using Tokens)

```tsx
import { spacing, typography } from '@clutter/editor/tokens';

<div
  style={{
    padding: spacing['8'],
    marginTop: spacing['16'],
    gap: spacing['12'],
    fontSize: typography.body,
    lineHeight: typography.lineHeightRatio,
    fontWeight: typography.weight.semibold,
  }}
/>;
```

## Example 5: Component with Theme Toggle

### Before (No Dark Mode)

```tsx
function Card({ children }) {
  return (
    <div
      style={{
        backgroundColor: '#fafaf8',
        border: '1px solid #ecece6',
        borderRadius: '6px',
        padding: '16px',
        boxShadow: '0 2px 4px rgba(37, 36, 32, 0.08)',
      }}
    >
      {children}
    </div>
  );
}
```

### After (Theme-Aware)

```tsx
import { useTheme } from '@clutter/shared';
import { colors } from '@clutter/ui/tokens/colors';
import { spacing, sizing } from '@clutter/editor/tokens';

function Card({ children }) {
  const theme = useTheme();
  const c = colors[theme.mode];

  return (
    <div
      style={{
        backgroundColor: c.background.default,
        border: `1px solid ${c.border.subtle}`,
        borderRadius: sizing.radius.lg,
        padding: spacing['16'],
        boxShadow: `0 2px 4px ${c.shadow.md}`,
      }}
    >
      {children}
    </div>
  );
}
```

## Example 6: Z-Index Management

### Before (Magic Numbers)

```tsx
<Menu style={{ zIndex: 9999 }} />
<Modal style={{ zIndex: 10000 }} />
<Tooltip style={{ zIndex: 10001 }} />
```

### After (Using Z-Index Scale)

```tsx
import { sizing } from '@clutter/editor/tokens';

<Menu style={{ zIndex: sizing.zIndex.dropdown }} />      // 1000
<Modal style={{ zIndex: sizing.zIndex.modal }} />        // 1050
<Tooltip style={{ zIndex: sizing.zIndex.tooltip }} />    // 1070
```

## Example 7: Creating CSS-in-JS Styles Object

### Before (Hardcoded)

```tsx
const styles = {
  container: {
    padding: 24,
    backgroundColor: '#fafaf8',
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    color: '#131210',
    marginBottom: 16,
  },
  text: {
    fontSize: 16,
    color: '#5c5b52',
    lineHeight: 1.5,
  },
};
```

### After (Using Tokens)

```tsx
import { useTheme } from '@clutter/shared';
import { colors } from '@clutter/ui/tokens/colors';
import { spacing, typography } from '@clutter/editor/tokens';

function MyComponent() {
  const theme = useTheme();
  const c = colors[theme.mode];

  const styles = {
    container: {
      padding: spacing['24'],
      backgroundColor: c.background.default,
    },
    title: {
      fontSize: typography.h1,
      fontWeight: typography.weight.bold,
      color: c.text.default,
      marginBottom: spacing['16'],
    },
    text: {
      fontSize: typography.body,
      color: c.text.secondary,
      lineHeight: typography.lineHeightRatio,
    },
  };

  return <div style={styles.container}>...</div>;
}
```

## Example 8: Adding New Token Values

If you need a color/spacing value that doesn't exist:

### Step 1: Identify the semantic purpose

Don't add `gray200` or `spacing14`. Instead, think about what it represents:

- Is it a background hover state?
- Is it a tertiary text color?
- Is it gap spacing between related items?

### Step 2: Add to the appropriate token file

**For colors** (`packages/ui/src/tokens/colors.ts`):

```typescript
// Add to both light and dark themes
export const colors = {
  light: {
    background: {
      // ... existing values
      elevated: stone[100], // New: for elevated cards/surfaces
    },
  },
  dark: {
    background: {
      // ... existing values
      elevated: neutral[800], // New: for elevated cards/surfaces
    },
  },
};
```

**For spacing** (`packages/editor/tokens.ts`):

```typescript
export const spacing = {
  // ... existing values
  componentGap: 12, // New: gap between related components
} as const;
```

### Step 3: Use the new token

```tsx
import { useTheme } from '@clutter/shared';
import { colors } from '@clutter/ui/tokens/colors';
import { spacing } from '@clutter/editor/tokens';

const c = colors[theme.mode];

<Card
  style={{
    backgroundColor: c.background.elevated,
    gap: spacing.componentGap,
  }}
/>;
```

## Quick Reference: Common Migrations

| Hardcoded Value            | Token Replacement                       |
| -------------------------- | --------------------------------------- |
| `#fafaf8` (light bg)       | `colors[theme.mode].background.default` |
| `#131210` (text)           | `colors[theme.mode].text.default`       |
| `#5c5b52` (secondary text) | `colors[theme.mode].text.secondary`     |
| `#ecece6` (border)         | `colors[theme.mode].border.subtle`      |
| `padding: 8`               | `spacing['8']`                          |
| `padding: 16`              | `spacing['16']`                         |
| `fontSize: 16`             | `typography.body`                       |
| `fontSize: 32`             | `typography.h1`                         |
| `fontWeight: 600`          | `typography.weight.semibold`            |
| `borderRadius: '6px'`      | `sizing.radius.lg`                      |
| `zIndex: 1000`             | `sizing.zIndex.dropdown`                |
| `lineHeight: 1.5`          | `typography.lineHeightRatio`            |

## Testing Theme Switching

After migrating to tokens, test both themes:

```tsx
// In your dev tools or test file
import { themeStore } from '@clutter/state';

// Switch to dark mode
themeStore.getState().setTheme('dark');

// Switch to light mode
themeStore.getState().setTheme('light');
```

Your component should automatically update with no visual glitches.
