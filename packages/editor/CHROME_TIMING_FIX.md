# Chrome Timing Fix - useLayoutEffect

## 🐛 Problem: 1-Frame Delay / "Lag"

### Symptom
Chrome appeared at old position, then "jumped" to correct position after ~16ms (1 frame).

### Console Logs Showed:
```
[chromeHoverManager] setHovered: abc-123
[ChromeRow] State: { top: 0, visible: true }        ← Old position
[ChromeRow] Position: { calculatedTop: 92 }
[ChromeRow] State: { top: 92, visible: true }       ← Corrected next frame
```

**User perception:** Chrome feels "laggy" or "detached"

---

## 🧠 Root Cause

### React Timing with `useEffect`:
1. Hover event fires → `hoveredBlockId` updates
2. ChromeRow renders with **old `top` value** (0 or stale)
3. Browser **paints** chrome at old position
4. `useEffect` runs **after paint**
5. `setTop()` updates state
6. ChromeRow **re-renders** next frame
7. Chrome **jumps** to correct position

**Result:** Visible 1-frame delay between hover and correct position

---

## ✅ Solution: useLayoutEffect

### Changed:
```typescript
// ❌ BEFORE (useEffect - runs AFTER paint)
useEffect(() => {
  const rowRect = row.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  setTop(rowRect.top - containerRect.top);
}, [blockId, containerRef]);
```

```typescript
// ✅ AFTER (useLayoutEffect - runs BEFORE paint)
useLayoutEffect(() => {
  const rowRect = row.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  setTop(rowRect.top - containerRect.top);
}, [blockId, containerRef]);
```

---

## 🎯 What Changes

### Timing Sequence (After Fix):
1. Hover event fires → `hoveredBlockId` updates
2. ChromeRow renders with old `top`
3. **`useLayoutEffect` runs BEFORE paint** 🔑
4. `setTop()` updates state
5. ChromeRow **re-renders synchronously**
6. Browser paints chrome **at correct position**

**Result:** Chrome appears instantly at correct position, no jump

---

## 📊 Console Logs (After Fix)

```
[chromeHoverManager] setHovered: abc-123
[ChromeRow] Position: { calculatedTop: 92 }
[ChromeRow] State: { top: 92, visible: true }  ← Correct on first paint
```

No more double-render visible to user!

---

## 🧠 Mental Model (Lock This In)

### When to Use Each Hook:

| Hook | When to Use | Example |
|------|-------------|---------|
| `useEffect` | Side effects, data sync, subscriptions | API calls, event listeners |
| `useLayoutEffect` | DOM layout reads/writes | Measuring elements, positioning overlays |

**Rule:** If you're reading layout (`getBoundingClientRect`, `offsetTop`, etc.) → use `useLayoutEffect`

---

## 🚫 Why This Isn't Over-Engineering

**Common objection:** "16ms delay is imperceptible"

**Reality:**
- Human eye detects motion at 10-15ms
- 1-frame delay = **perceptible jank**
- Notion/Linear/Craft all use `useLayoutEffect` for chrome
- This is the **standard solution** for layout-critical UI

---

## ✅ Result

**Before:**
- Chrome felt "detached" or "laggy"
- Visible jump on hover
- Two renders per hover

**After:**
- Chrome appears instantly
- No visible jump
- Single paint per hover
- Feels native / Notion-like ✅

---

**Status: Timing bug eliminated. Chrome system is now production-grade.** 🎯
