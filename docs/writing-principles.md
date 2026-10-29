# Clutter — Writing Principles

## Purpose and scope

This document guides how user-facing copy is written in Clutter: empty states, buttons, menus, tooltips, placeholders, dialogs, notifications, loading states, and errors.

**These are principles, not templates.** They exist to help a writer or reviewer make a good decision for a specific message. They do not prescribe fixed wording, a fixed length, or a fixed structure, and they do not require changes to copy that already works.

**Not covered here.** This document does not define canonical product terms (that belongs in a separate terminology guide) and does not list or revise existing messages (that belongs in a separate copy inventory). It also says nothing about code, styling, or behavior.

---

## Core principles

### 1. Context over rigid rules

Choose wording from the user's situation and what they need to know at that moment. A message does not have to match its neighbors in length, structure, or tone if its situation is different.

### 2. Clarity and directness

Use familiar words and plain sentences. Say what is true or what will happen, specifically. Prefer "Couldn't open this PDF" to a message that makes the user guess what failed.

### 3. Concision without losing meaning

Cut words that add nothing. Do not cut words that carry meaning. A short message that leaves the user unsure is worse than a slightly longer one that doesn't.

### 4. Helpful next steps

Include an action or hint when it helps the user move forward. Skip it when the next step is obvious or the action would repeat something already on screen. Don't add a button only because a slot exists for one.

### 5. Distinguish interface states

These situations differ, so their copy should too. They are not interchangeable.

| State | What the user needs | Approach |
| --- | --- | --- |
| **Empty state** | To know nothing is here, and sometimes why or what to do | Say what the place holds, or offer the action that fills it, depending on how obvious it is |
| **No search results** | To know the query found nothing, and that the system worked | Refer to the thing searched for. Don't imply the collection itself is empty |
| **Loading** | To know something is in progress | Brief and neutral. Avoid it entirely if the wait is imperceptible |
| **Error / unavailable** | To know what failed and, if possible, what to do about it | Name what failed. Offer a recovery step when one exists. Don't blame the user |
| **Input placeholder** | A hint about what to type, or that a value is unset | Describe the input. Never put instructions the user must read twice. A placeholder is not a label |
| **Success** | Confirmation that an action took effect, when it isn't already visible | Keep it quiet. Omit it when the result is visible on its own |
| **First-use guidance** | Orientation the first time, not on every visit | Helpful once, noise afterward. Prefer copy that still reads well when the user returns |

A message that blends two states (for example, an error that is also reported as "empty") hides what actually happened. Keep them distinct.

### 6. Consistent terminology

Use established product terms the same way everywhere. Don't introduce a synonym for something the product already names, unless the two things are genuinely different. Where it isn't settled what a thing is called, raise it as a terminology question rather than choosing locally.

### 7. Language conventions

These standards apply to all user-facing copy, existing and new. They are the one place this document sets firm rules; the other principles are judgment calls.

| Element | Recommended standard | Example |
| --- | --- | --- |
| Capitalization | Sentence case throughout the interface: headings, labels, buttons, menu items, placeholders, and messages. Capitalize only the first word, proper nouns, and names that are proper names | Preferred: "New note". Avoid: "New Note" |
| Terminal punctuation | No period at the end of user-facing UI copy. This covers empty states, explanatory messages, buttons, labels, placeholders, tooltips, notifications, errors, and any other standalone UI string, whether it is a fragment or a full sentence | Preferred: "No folders available". Avoid: "No folders available." |
| Periods inside content | A period that is part of the content stays: decimal numbers, file names and extensions, abbreviations, and version numbers. The rule above concerns sentence-ending periods only | "Version 1.2", "notes.md", "e.g." |
| Spelling | American English | Preferred: "Organize". Avoid: "Organise" |
| Apostrophes | Typographic apostrophe (`’`, U+2019) in contractions and possessives, never the straight `'` | Preferred: "You’re all clear". Avoid: "You're all clear" with a straight apostrophe |
| Quotation marks | Typographic quotes (`“ ”`) around quoted names in prose | “Projects” |
| Contractions | Welcome in sentences. Keep them out of labels where they would read oddly | "Couldn’t open this PDF" |
| Ellipsis | The single character `…`, not three periods, used where it helps: a menu item that opens a further step, or an in-progress state. Not added by habit, and not a substitute for a period | "Rename…", "Loading…" |
| Exclamation marks | Avoid | |

When copy contains more than one sentence, the sentences inside it are separated normally, and only the final one drops its period. If a message needs several sentences, consider whether it is carrying too much for a UI string.

These conventions are fixed. The principles above them guide how a message is worded; these govern how it is written.

### 8. Tone

Calm, clear, respectful, and approachable. Avoid:

- Urgency the situation doesn't warrant.
- Excitement, congratulation, or cheerleading.
- Blame ("You entered an invalid…"). Describe the problem, not the person.
- Filler and chatter ("Oops!", "Hmm…", "Looks like…").

### 9. Respect the user's attention

Clutter is a focused workspace for knowledge. Copy should stay out of the way of the work. Drop redundant explanations, repeated information, and messages that compete with the content on screen. If the interface already makes something clear, it may not need words.

### 10. Contextual judgment

These principles inform judgment; they do not replace it. Existing copy whose wording already serves its purpose should keep that wording. Language conventions (principle 7) still apply to it, so it is brought into line on capitalization, punctuation, spelling, and apostrophes without being rewritten. When principles pull in different directions (clarity against concision, for example), decide by asking what the user in that situation needs.

### 11. Choose the surface

Where a message appears matters as much as what it says. Every message that tells the user something went wrong, or went right, uses exactly one of these surfaces, chosen by what the user must do about it, not by whichever mechanism is nearest.

**Modal.** For a consequential decision the user must make, particularly when dismissing or proceeding could lose data or block an important workflow. Examples: confirming how to handle unsaved changes when closing; reviewing crash-recovery content; resolving a missing Space when the user has to act. Not for an ordinary save failure that a persistent notice can explain.

**Persistent notice near the affected content.** For a condition that stays unresolved, shown until it is resolved and never removed by a timer. For a note that cannot be saved, this is the existing `SaveFailureNotice` in the top bar of that note. Examples: the note cannot be saved; the note changed on disk and needs conflict handling; the current location does not support safe saving; saving as a new note failed, leaving the user's content unsaved. It offers the recovery actions that are safe (Retry; Save as new note) and withholds any that could overwrite an external change or discard unsaved content. A failed action taken from the notice (a failed Save as new note) is reported inside the same notice, with the most precise reason that is safe to show, and does not remove it: clicking an action never clears a condition that is still true.

**Toast.** For the brief outcome of an action, where no persistent warning and no decision is needed: a success, a completed operation that needs a short confirmation, a non-blocking status update. A toast is never the only notification of a failure while unsaved content remains. (One persistent exception is listed below.)

**Inline feedback in a dialog.** For validation or an error specific to the dialog's current input or choice: the selected folder cannot be used, the chosen location fails an access or safety check, a field is invalid. It is shown next to the choice it is about, the dialog stays open, and the user can correct the choice without losing the dialog's state. A refused folder is a validation of the user's choice, not an event, so it is not a toast. Where no dialog is open (a picker with nothing but the system panel), do not invent an inline place: use the existing notice, and say why here.

**One cause, one actionable explanation.** Do not report one underlying failure through several surfaces or in several wordings. When an unsupported location makes both a Space's settings write and a note save fail, the user is told once, precisely ("Can’t save safely to this location"), where it matters, and not also "Couldn’t save the space settings". Classify a failure by its type, never by its message text, so the right layer can handle it. Independent failures are reported separately, and only when the user needs to understand both. A failure that retrying cannot fix (an unsupported location) does not offer Retry.

Notices belong to the page or Space they are about: switching notes or Spaces must never show another item's notice.

#### Known deviations, and what is intended

Verified against the code when this section was written.

*Resolved:*

- **A failed Save as new note was a toast.** The note's notice already stayed, but the only message that the copy failed was a generic, vanishing toast. The reason (full disk, name taken, no permission, unsupported location) is now part of the notice, which stays while the note is unsaved; the button is disabled while a copy runs; the message belongs to its note and goes when the note's failure is resolved.
- **An unsupported location produced two accounts of one cause.** Opening a Space there writes its identity automatically, which failed with "Couldn’t save the space settings", followed by the note-save notice. An automatic profile write that fails only because the location is unsupported is no longer announced; a change the user asked for (an avatar) is announced with the precise message, inline in the dialog or as a notice after the Space has opened; any other cause is still "Couldn’t save the space settings".
- **A refused folder was a transient notice.** The Welcome screen, the New space settings dialog (Change location) and the "Space not found" dialog now show the reason inline and stay open. The same applies to the dialog's own Create, rename and open refusals.

*Remaining, deliberately:*

- **A note that fails while it is not the open note** is a persistent toast with an Open action. There is no note on screen to attach a notice to; the toast does not time out and the note's own notice appears when it is opened. This is the one exception to "a toast is never the only notification of a save failure". Recovered work for another note behaves the same way.
- **A folder refused by the sidebar's New space or Add space picker** is still the registry's notice: the system panel is the only UI until a folder is accepted, so there is no dialog to host an inline message.
- **A folder refused from a missing Space's Settings page** ("Change location" there) is still the registry's notice. Showing it inline needs the result threaded through six layers (`AppShell`, `SpacesContext`, `ActiveSpaceSettingsDialog`, `SettingsDialog`, `Settings`, `SpacePage`) into the page's existing inline error; intended, not done.
- **Unexpected exceptions in the Space dialogs** ("Couldn’t set up the space", "Couldn’t create the space", "Couldn’t change the folder") are toasts: they are unclassified and not about a choice the user can correct. Once such a failure is classified it should move inline.
- **The user is not told about an unsupported location until they try to save.** Opening such a Space is silent (the automatic write is not announced), and the explanation appears when a note is first edited. A message at the moment the folder is chosen is an open product decision (docs/building-and-distribution.md, checklist item 9).

---

## Examples

Illustrations only. They show reasoning, not required wording.

- **An obvious empty state can be brief.** On a tasks list, "No tasks yet" is enough.
- **A less obvious one can explain.** Where a user wouldn't know how a collection fills, "Tasks from your notes will appear here" tells them where the contents come from.
- **No search results name what was searched.** "No notes found" is distinct from an empty collection and doesn't suggest nothing exists.
- **An action helps when it's the natural next step.** "No templates yet" with a button to create one is useful. The same line with a button repeating text the user can already see is not.
- **Errors say what failed.** "Couldn’t save the template" gives the user something to act on. "Something went wrong" does not.

---

## Applying the principles

When writing new copy or reviewing a change:

1. **Identify the state.** Is this an empty collection, a failed search, a loading state, an error, a placeholder, a confirmation, or first-use guidance? Choose wording appropriate to that state (principle 5).
2. **Ask what the user needs here.** What would they want to know, and what, if anything, do they need to do next? (principles 1, 4)
3. **Check the words.** Familiar, specific, and no longer than it needs to be (2, 3).
4. **Check the terms.** Does it use the product’s existing name for each concept (6)?
5. **Check the conventions.** Sentence case, no ending period, American spelling, typographic apostrophes, ellipsis (7), and tone (8).
6. **Check for noise.** Could this be shorter, or removed, without loss (9)?
7. **Check the surface.** Is it a modal, a persistent notice, a toast or inline in a dialog, by the rule in principle 11, and is the same cause reported once (11)?
8. **Leave good wording alone.** Changing wording that already works creates churn without benefit (10). Conventions still apply to it.

A reviewer who proposes a change should say which principle it serves. A writer who thinks a convention in principle 7 doesn’t fit a case should raise it for discussion rather than depart from it locally.
