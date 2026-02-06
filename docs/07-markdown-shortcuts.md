# File 07 — Markdown Shortcut Semantics

**Status**: 🔒 LOCKED  
**Scope**: Markdown → Node Variant conversion  
**Version**: 1.0  
**Locked Date**: 2026-02-06

---

## Purpose of This Document

This document defines **exactly when and how** markdown shortcuts convert a node's variant.

It answers definitively:

- When markdown triggers
- What constitutes a valid trigger
- What text is consumed
- What text remains
- How cursor/selection behaves
- What is explicitly forbidden

**If behavior deviates from File 07, it is incorrect by definition.**

---

## 0. Core Principle (Non-Negotiable)

### Markdown Converts on COMMIT, Not on TEXT

Markdown shortcuts trigger **ONLY** when a **SPACE** is typed immediately after a valid prefix at the start of a node.

- **Not** on typing the prefix
- **Not** on typing text
- **Not** on paste
- **Not** retroactively
- **Not** heuristically

**The space character (`" "`) is the commitment signal.**

---

## 1. Trigger Conditions (ALL Must Be True)

A markdown shortcut conversion occurs **iff** all of the following are true:

1. **Cursor is at start of node**

   ```
   offset === prefix.length
   ```

2. **Node text exactly matches a valid prefix**  
   (no extra characters)

3. **User types a space character (`" "`)**

4. **Node is not deleted**

5. **Node is not in grammar mode** (`/`, `@`, `#`)

**If any condition fails, markdown does not trigger.**

---

## 2. Valid Prefixes (v1.0)

| Prefix | Space Typed | Resulting Variant | Consumed Text |
| ------ | ----------- | ----------------- | ------------- |
| `-`    | `-␣`        | `bullet`          | `-␣`          |
| `[]`   | `[]␣`       | `task`            | `[]␣`         |
| `#`    | `#␣`        | `heading-1`       | `#␣`          |

**No other prefixes are valid.**

---

## 3. Task Variant (Authoritative)

### 3.1 Valid Trigger

```
[]␣
```

### 3.2 Behavior

On typing space after `[]`:

1. Node variant becomes `task`
2. Prefix `[]␣` is fully removed
3. Remaining text is preserved
4. Caret remains at logical offset `0`

---

### 3.3 Examples (Exhaustive)

| Input Sequence | Result                            |
| -------------- | --------------------------------- |
| `[]`           | ❌ no conversion                  |
| `[]␣`          | ✅ task, text = `""`              |
| `[]␣buy milk`  | ✅ task, text = `"buy milk"`      |
| `[]buy␣`       | ❌ no conversion                  |
| `foo []␣`      | ❌ no conversion                  |
| `[ ]␣`         | ❌ no conversion (invalid prefix) |

---

## 4. Text Consumption Rules (CRITICAL)

When a markdown shortcut triggers:

- The **entire prefix AND the space** are consumed
- No prefix characters remain in `node.text`
- The space is **not** inserted into text
- Conversion is **atomic**

**Example:**

```
Before: "[]␣buy milk"
After:  "buy milk"
```

---

## 5. Cursor & Selection Semantics

### 5.1 Caret Placement

After conversion:

- Caret offset = `0`
- Selection = `null`
- Browser owns rendering (File 06)

**No manual caret placement unless required by the operation.**

---

### 5.2 Undo Semantics

Markdown conversion is **ONE undo step**.

Undo restores:

- Previous variant
- Original text (including prefix)
- Caret position before space

---

## 6. Explicit Non-Triggers (LOCKED)

Markdown shortcuts **MUST NOT** trigger on:

- ❌ Typing the prefix alone  
  (`[]`, `-`, `#`)
- ❌ Typing text after prefix without space  
  (`[]buy`)
- ❌ Space not immediately after prefix  
  (`[]foo␣`)
- ❌ Prefix not at start of node  
  (`foo []␣`)
- ❌ Paste events
- ❌ Programmatic text insertion
- ❌ Selection replacement
- ❌ Multi-cursor (not supported)
- ❌ During grammar sessions

---

## 7. Grammar Interaction (CRITICAL)

Markdown shortcuts are **disabled** when:

- Slash grammar (`/`)
- Mention grammar (`@`)
- Property grammar (`#key:`)

**Grammar has priority. Markdown is ignored until grammar session ends.**

---

## 8. Implementation Constraints (MANDATORY)

### 8.1 Where Detection Happens

- Detection happens **only** inside `handleKeyDown`
- Triggered **only** on `event.key === " "`
- Uses **editor state snapshot** (not DOM)

---

### 8.2 Forbidden Implementation Patterns

Cursor AI **MUST NOT**:

- ❌ Regex-scan entire line
- ❌ Re-parse text after every keystroke
- ❌ Trigger on text input events
- ❌ Trigger on paste
- ❌ Modify selection manually
- ❌ Insert then delete the space
- ❌ Guess user intent

---

## 9. Validation Checklist (MUST PASS)

### Task Variant

- ✅ `[]␣` converts immediately
- ✅ `[]␣text` preserves text
- ❌ `[]text␣` does nothing
- ❌ `foo []␣` does nothing
- ✅ Undo restores exact state

### General

- ✅ No cursor jump
- ✅ No flicker
- ✅ No double undo
- ✅ No delayed conversion

---

## 10. Relationship to Other Files

- **File 03** — Keyboard semantics define when space is handled
- **File 04** — Variant identity & persistence
- **File 06** — Browser owns caret & selection

**File 07 does not override those files.**  
**It is strictly layered on top.**

---

## Canonical Statement (LOCK)

A markdown shortcut converts a node's variant **only** when the user types a space immediately after a valid prefix at the start of the node.

**Anything else is invalid.**

---

## Status

- ✅ Written
- ✅ Reviewed
- ✅ **LOCKED** (2026-02-06)

**Any future changes require:**

- New file (File 07.1)
- Explicit approval
- Validation against Files 03, 04, 06

---

**END OF FILE 07**
