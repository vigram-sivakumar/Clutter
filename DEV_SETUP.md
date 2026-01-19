# Development Setup

## Monorepo Package Resolution

### ✅ How It Works (Dev Mode)

The app is configured to use **source files directly** during development via Vite aliases in `apps/desktop/vite.config.ts`.

```typescript
'@clutter/editor': path.resolve(__dirname, '../../packages/editor/index.ts')
```

This means:

- ✅ Changes apply **instantly** (hot reload)
- ✅ No need to rebuild packages
- ✅ Debug logs work
- ✅ Source maps are accurate

### 📦 Package Aliases

| Package           | Dev Import                     | Prod Import      |
| ----------------- | ------------------------------ | ---------------- |
| `@clutter/editor` | `packages/editor/index.ts`     | `dist/index.mjs` |
| `@clutter/state`  | `packages/state/src/index.ts`  | `dist/index.mjs` |
| `@clutter/ui`     | `packages/ui/src/index.ts`     | `dist/index.mjs` |
| `@clutter/shared` | `packages/shared/src/index.ts` | `dist/index.mjs` |
| `@clutter/domain` | `packages/domain/src/index.ts` | `dist/index.mjs` |

---

## Development Workflow

### Standard Dev (Recommended)

```bash
npm run dev
```

- Uses source files directly
- Hot reload enabled
- Instant feedback

### Production Build

```bash
npm run build
```

- Builds all packages to `dist/`
- Creates optimized bundles
- Used for production deployment

---

## Troubleshooting

### "My changes aren't showing up"

**Old Problem (Before Fix):**

- App was loading from `packages/*/dist/` (pre-built)
- Required manual rebuild: `cd packages/editor && npm run build`

**Current Setup (Fixed):**

- App loads from source files
- Changes apply immediately via HMR

### "I see import errors"

Check that:

1. The source file exists at the path specified in `vite.config.ts`
2. TypeScript types are exported correctly
3. You've run `npm install` in the root

### Verify What's Being Loaded

Open DevTools → Sources tab:

- ✅ Should see: `packages/editor/core/EditorCore.tsx` (source)
- ❌ Should NOT see: `packages/editor/dist/index.mjs` (built)

---

## Why This Matters

### Before (Broken DX)

```
Edit source → No change → Must rebuild → Restart dev server → Test
```

### After (Good DX)

```
Edit source → Hot reload → Instant feedback
```

---

## Adding New Packages

If you create a new package in `packages/`:

1. **Create the package** with `src/index.ts` or `index.ts`
2. **Add alias** to `apps/desktop/vite.config.ts`:
   ```typescript
   '@clutter/new-package': path.resolve(__dirname, '../../packages/new-package/src/index.ts')
   ```
3. **Restart dev server** (aliases only load on startup)

---

## Production Considerations

The Vite aliases **only affect development**. Production builds use:

- Package `exports` field in `package.json`
- Pre-built `dist/` bundles
- Optimized and minified code

This is configured in each package's `package.json`:

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  }
}
```

---

## Best Practices

✅ **DO:**

- Edit source files and rely on hot reload
- Use `npm run dev` for development
- Run `npm run build` before deploying

❌ **DON'T:**

- Manually rebuild packages during development
- Edit files in `dist/` folders (they're generated)
- Assume dist changes will appear without rebuild

---

## Related Files

- `apps/desktop/vite.config.ts` - Vite aliases configuration
- `turbo.json` - Monorepo build pipeline
- `packages/*/package.json` - Package exports and build config
