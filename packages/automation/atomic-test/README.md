# Atomic-save real-app tests (ADR-063)

Test-only. These drive a **separate build of Clutter** that cannot see the developer's real Spaces:

- its own executable name (`clutter-atomictest`): WebKit keys its storage (localStorage, so the Space registry) by the
  executable name of an unbundled binary, and a throw-away `HOME` alone does **not** isolate it (a first attempt showed
  the developer's real registry);
- its own identifier (`com.clutter.atomictest`): app data and the persisted filesystem scope live under it, inside the
  throw-away `HOME`;
- its own build output, frontend build and dev-server port, so a running `tauri dev` is never touched;
- disposable Spaces only, under `$CLUTTER_FAKE_HOME/Documents`.

`assertIsolatedProfile` (`isolation.ts`) is the enforced precondition: every spec calls it first and it **throws before
anything is written** if the profile is not provably the isolated one.

```
./atomic-test/build-isolated-app.sh <scratch-dir> [native-writer: true|false]   # frontend + binary, into <scratch-dir> (atomic saves are the only writer; `false` builds without the native writer to prove the app then refuses to open a Space)
./atomic-test/run.sh <scratch-dir> [spec-glob]        # serves it on :15421, throw-away HOME, cleans up
```
