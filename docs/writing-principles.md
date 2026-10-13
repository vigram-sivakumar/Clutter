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
7. **Leave good wording alone.** Changing wording that already works creates churn without benefit (10). Conventions still apply to it.

A reviewer who proposes a change should say which principle it serves. A writer who thinks a convention in principle 7 doesn’t fit a case should raise it for discussion rather than depart from it locally.
