# Clutter support

This is the source of Clutter's published support page. Publish it unchanged (the address goes in `apps/app/src/core/legalLinks.ts` and in App Store Connect as the Support URL; see [privacy-release.md](./privacy-release.md)).

**Before publishing:** replace `[support contact email, to be added before publishing]` below with a real address. No support address has been chosen yet.

## Get help

Write to [support contact email, to be added before publishing]. Include:

- what you were doing and what you expected;
- what happened instead, and any message Clutter showed;
- your Mac model, macOS version and Clutter version (Clutter menu, About Clutter);
- whether the Space is on your Mac's internal disk or an external drive, or inside a cloud-synced folder.

Please don't send your notes unless asked. If a problem involves a note, describe it, or send a small example that doesn't contain anything private.

## Common questions

**Where are my notes?** In the folder of each Space, as plain Markdown files, plus a hidden `.clutter` folder for Clutter's own data. Choose a Space in Settings to see its folder.

**Clutter says it can't open a Space.** The folder may have moved, been deleted or been disconnected (for example an external drive), or macOS may no longer allow Clutter to open it. Open Settings, choose the Space, and choose its new location, or add the folder again.

**Clutter says it can't save safely to a location.** Clutter saves notes safely only on volumes formatted as APFS (the default for a Mac's internal disk). A folder on another kind of volume (some external drives and network shares) can be opened but not saved to. Move the Space to an APFS volume.

**I lost unsaved text after a crash.** Clutter keeps recovery copies of unsaved text and offers them the next time it opens. If a note was saved, nothing is lost.

**I deleted a note by mistake.** Open Archive: archived notes can be restored. A note you deleted permanently is gone; restore it from a Time Machine or other backup of its folder.

**Cover photos don't load.** The Unsplash picker needs an internet connection and can pause when many photos have been requested in a short time; try again in a moment. A cover that points to a web address needs that website to be reachable.

**What does Clutter send over the internet?** See the [privacy policy](./privacy-policy.md).
