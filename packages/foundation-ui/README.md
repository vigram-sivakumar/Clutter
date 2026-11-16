# Shared editor workspace controller

View/layout orchestration over existing CoreClient, EditingContextRegistry and
EditorSession. No OS, SQL, direct filesystem writes or semantic reducers. Selection
bookmarks are opaque/view-local and map through foreign edits while detached;
context history survives view remount. Close freezes edits and delegates existing
save/protection handling; unsafe close retains views/focus. The minimal development
screen lives in apps/foundation-desktop; this controller does not establish a new
product visual design. Existing React UI reuse is planned separately.
