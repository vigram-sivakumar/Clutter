# ADR-070: Welcome content is provisioned by the Welcome Screen entry point, into a completely empty Space, never by detecting an empty Space

**Status: Accepted** (2026-11-08). Amends [ADR-067](./067-first-run-welcome-content-is-installed-once-into-the-first-space.md): the install workflow, its per-Space ledger, the Gate-routed create-only writes and the first-run gate (nothing shown until installed and verified) are unchanged. What changes is the decision of *when* the workflow is started. No new subsystem, write path or storage key.

## Context

ADR-067 started the install only for a folder Clutter had just created through the Welcome dialog's Create, and only while an application-level record (`clutter.welcomeContent`) was absent. Two consequences did not match the intended product behavior:

- Once the record existed (any state), no later Welcome Screen open could ever populate a new Space, for example after the user removed every Space and the Welcome Screen returned.
- An empty folder chosen in the Welcome Screen with Select a folder, or in the Documents panel, was recorded as a permanent skip, although it is an empty new Space just like a created one.

A Space opened outside the Welcome Screen also ran `resumeInterruptedWelcomeContent` in the background, which is welcome content provisioning outside the Welcome flow.

## Decision

1. The creation entry point decides. The Welcome Screen's open sequence (Create, Select a folder, the folder chosen in the Documents panel) is the only caller of `prepareWelcomeSpace`, and `prepareWelcomeSpace` is the only place the install is started. The sidebar Space selector, startup restore, recovery and switching never provision, and nothing observes a Space to decide it is empty.
2. For a Welcome Screen open, `WelcomeContentService.install()` is always asked. It already installs only into a completely empty Space (no pages, folders or resources) and never into one that holds anything, which is left untouched.
3. The Space's own `welcomeInstall` ledger is the only "never again" guard. A Space that has ever had an install started refuses a new one, so deleting every note or file never brings the content back. The application-level record is removed: there is no once-per-install state.
4. Only an install the ledger records as interrupted is continued, and only through a Welcome Screen open of that Space (the retry). `resumeInterruptedWelcomeContent` is removed. Content this call did not write is never re-verified: a previously populated Space the user has edited cannot close the gate.
5. `prepareWelcomeSpace` reports `installed` so that only a Space that was just populated opens on the "Welcome to Clutter" folder. Any other Space opens as before.

## Consequences

- Every Welcome Screen open of a new empty Space is populated, not only the first one per install.
- A half-installed Space left by an older build is no longer finished in the background. Opening it again through the Welcome Screen resumes it. The stale `clutter.welcomeContent` key in existing installs is no longer read.
- `welcomeInstallNotice` (the toast for a background resume failure) is no longer wired to anything.

## Alternatives considered

- **Keep the once-per-install record and add the other rules around it**: rejected; it blocks every later Welcome Screen creation.
- **Provision any Space that opens empty**: rejected; an empty Space alone is never a reason, and it would refill a Space the user emptied.
