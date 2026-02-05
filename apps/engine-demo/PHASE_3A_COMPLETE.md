# Phase 3A Complete — Slash Command UX

## Model Chosen (Locked)

**Tana-style, context-aware short list**  
Not a global command palette.

### Why This Model:

- ✅ Faster for thinking-in-place
- ✅ Fewer choices = less cognitive load
- ✅ Matches engine's command surface
- ✅ Scales better with templates, refs, properties

---

## What Was Implemented

### 1. Enhanced Command Registry (`input/parseSlash.ts`)

**New Command Metadata:**

- `category`: Structure | Property | Template | Document | System
- `frequency`: high | medium | low (for default ordering)
- `aliases`: Alternative names for filtering
- `requiresContext`: Optional node context requirements

**Reorganized Commands:**

**Structure** (5 commands):

- `create` - Create new child node
- `delete` - Delete current node
- `indent` - Indent node (requires sibling)
- `outdent` - Outdent node (requires parent)

**Property** (3 commands):

- `todo` - Set status = todo
- `tag` - Add property tag
- `heading`, `paragraph` - Convert node type

**Template** (1 command):

- `template` - Apply template to node

**Document** (1 command):

- `new` - Create new document

**System** (1 command):

- `save` - Save workspace now

### 2. New Filtering Functions

**`getCommandsByCategory()`**

- Returns commands grouped by category
- Sorted by frequency within each category

**`getHighFrequencyCommands()`**

- Returns only high-frequency commands
- Used for initial `/` display

**`filterCommands(query, includeAll)`**

- Filters by command name or alias
- Supports partial matching
- Sorts by relevance (starts with > contains)

**`getCategoryLabel(category)`**

- Returns display name for category

### 3. Enhanced GrammarChooser UI

**Category Grouping:**

- Commands grouped by category for slash commands
- Category headers with uppercase labels
- Logical category ordering (Structure → Property → Template → Document → System)

**High-Confidence Filtering:**

- Only shows high/medium confidence candidates by default
- Hides low-confidence unless no high-confidence exists
- Reduces cognitive load

**Improved Row Structure:**

```
[ Command Name ]          [ Category ]
Description text (1 line max, truncated)
```

**Better Visual Hierarchy:**

- Selected item has bold text + highlight
- Category headers in subtle uppercase
- One-line descriptions (ellipsis on overflow)
- Compact spacing (no wasted vertical space)

### 4. Execution Improvements

**Slash Text Removal:**

- After committing command, slash text is removed from node
- Cursor moves to where grammar started
- Clean slate for continued typing

**Tab Autocomplete:**

- When single candidate exists, Tab autocompletes command name
- Adds space after command for argument input
- Grammar re-detects on next keystroke

**Space Commit:**

- Space commits slash command and continues typing (already worked)
- Fast for "execute and keep writing" workflow

### 5. Keyboard Behavior (Locked)

| Key         | Behavior                                 |
| ----------- | ---------------------------------------- |
| `↑` `↓`     | Move selection                           |
| `Enter`     | Execute command                          |
| `Space`     | Execute command and continue typing      |
| `Esc`       | Cancel                                   |
| `Tab`       | Autocomplete command name (single match) |
| `Backspace` | Updates filter                           |

---

## User Flow Examples

### Example 1: Fast Todo Conversion

```
Type: /todo
See: "Set status = todo" (auto-selected)
Press: Space
Result: Node becomes todo, / removed, ready to type
```

### Example 2: Template with Autocomplete

```
Type: /t
See: todo, template filtered
Arrow: Down to template
Tab: Autocompletes to "/template "
Type: Meeting
Enter: Applies Meeting template
```

### Example 3: Category Browsing

```
Type: /
See: High-frequency commands grouped by category
     STRUCTURE: create, delete, indent, outdent
     PROPERTY: todo, tag
     TEMPLATE: template
     DOCUMENT: new
     SYSTEM: save
Arrow: Navigate categories
Enter: Execute selected
```

---

## What Slash Does (Locked)

✅ **IS:**

- Temporary intention trigger
- Removes itself after execution
- Becomes undoable command
- Context-aware (future: disables invalid commands)

❌ **IS NOT:**

- Inserted text
- Markup/syntax
- Persisted in document
- Rendering instruction

---

## Edge Cases Handled

| Case                  | Behavior         |
| --------------------- | ---------------- |
| `/` inside code block | Ignored (future) |
| `/` mid-word          | Ignored          |
| `/` after space       | Valid            |
| Multiple slashes      | Last one wins    |
| Backspace removes `/` | Closes menu      |
| Cursor moves away     | Closes menu      |

---

## Phase 3A Exit Criteria (ALL MET)

✅ `/` feels instant (opens immediately on type)  
✅ Common actions executable without thinking  
✅ Undo always works (command-based)  
✅ NO visual polish added yet (intentional)  
✅ Category grouping functional  
✅ High-confidence filtering works  
✅ Slash text removed after execution  
✅ Tab autocomplete implemented

---

## What We Did NOT Do (By Design)

❌ No visual design/polish  
❌ No icons  
❌ No colors/theming  
❌ No animations  
❌ No context filtering (hasParent/hasSibling checks) - deferred  
❌ No code block detection - deferred

**Functional mechanics first. Visual design later.**

---

## Files Modified

**Enhanced:**

- `src/input/parseSlash.ts` (+150 lines)
  - CommandCategory type
  - Enhanced SlashCommandMeta with category, frequency, aliases
  - Reorganized SLASH_COMMAND_REGISTRY
  - getCommandsByCategory, getHighFrequencyCommands, filterCommands

- `src/ui/grammar/GrammarChooser.tsx` (+100 lines)
  - Category grouping
  - High-confidence filtering
  - Enhanced row structure
  - getCategoryFromCommandType helper

- `src/NodeEditor.tsx` (+60 lines)
  - Slash text removal in commitGrammar
  - Tab autocomplete handler
  - Better grammar state management

- `src/input/resolveIntent.ts` (+30 lines)
  - Additional command mappings (create, tag, paragraph)
  - Context-aware intent resolution (foundation)

- `src/input/index.ts` (+5 lines)
  - Export new slash command utilities

**Zero linter errors** in new code.  
**All enhancements functional.**

---

## Next: Phase 3B — @Mention UX

Now that slash commands feel right, we move to mentions:

- Node cards (reference display)
- Date chips (temporal references)
- Document ambiguity resolution
- Autocomplete picker
- Cross-workspace references (UI)

**Slash mechanics are locked. Ready for mentions.**
