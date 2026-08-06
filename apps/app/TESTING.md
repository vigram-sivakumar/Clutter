# Testing — apps/app

This package's own tests are **unit tests only** — `*.test.ts` files
colocated with the code they validate (e.g. `Workspace.test.ts`,
`PagePathResolver.test.ts`), run with Vitest.

```bash
npm test                # watch mode
npm run test:run        # single run (add --workspace=apps/app from the repo root)
```

## UI automation lives elsewhere

End-to-end / UI automation against the real Tauri application is **not**
part of this package — it lives in
[`packages/automation`](../../packages/automation/AUTOMATION.md), as a
separate workspace that consumes this app's compiled binary over
WebDriver. `apps/app` has no WebdriverIO (or Playwright — the earlier
browser-mode Playwright suite was removed; testing a Tauri app via a plain
browser can't exercise the real webview or filesystem) dependency at all;
this is deliberate, so the production build never carries automation
tooling. See `packages/automation/AUTOMATION.md` for how to run it.

## The application's automation contract

Stable `data-testid` selectors that `packages/automation` locates elements
by live at [`src/shared/testing/selectors.ts`](src/shared/testing/selectors.ts) —
owned by the application, not by `devtools/`, since it's a public contract
automation depends on rather than a debugging tool. Add a selector there
(and apply it to the component) before writing an automation scenario
against a new UI element.

## devtools/

[`devtools/`](devtools/index.ts) (sibling to `src/`, not nested inside it)
is optional, development-only tooling exposed as `window.__clutter_devtools`
— gated on `import.meta.env.DEV` and `VITE_DEVTOOLS=true`, so it's dead
code in any production build. It's for interactive debugging/inspection,
not automation infrastructure.
