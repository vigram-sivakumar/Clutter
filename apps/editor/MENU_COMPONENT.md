I would build the menu component, not the interaction.

Think of it as two separate concerns:

1. Menu (the UI)
2. Triggers (how it’s opened)

Many teams make the mistake of building a “context menu.” Instead, build a generic Menu.

Then it can be opened by:

- ✅ Three-dot button
- ✅ Right click
- ✅ Keyboard (Shift + F10 or Context Menu key)
- ✅ Another button in the future

⸻

I’d build it like this

<Menu>
  <Menu.Trigger>
    <Button isIconOnly>
      <Icons.MoreHorizontal />
    </Button>
  </Menu.Trigger>
  <Menu.Content>
    <Menu.Item>Rename</Menu.Item>
    <Menu.Item>Duplicate</Menu.Item>
    <Menu.Separator />
    <Menu.Item variant="danger">
      Delete
    </Menu.Item>
  </Menu.Content>
</Menu>

Later you can also do:

<Menu trigger="context">
  <FolderItem ... />
</Menu>

or

<div
  onContextMenu={(e) => {
    e.preventDefault();
    menu.open(e.clientX, e.clientY);
  }}
>

using the same Menu.Content.

⸻

What would Clutter do?

I’d support both.

- Primary interaction: Three-dot button
- Power-user shortcut: Right-click

That’s exactly what applications like VS Code, Finder, and many desktop-style apps do. The three-dot button is discoverable for everyone, while right-click is a convenience for experienced users.

⸻

My recommendation

When you reach that phase:

1. ✅ Build the Menu component first.
2. ✅ Wire it to the three-dot button.
3. ✅ Add right-click support afterward by opening the same menu programmatically.

This keeps the menu implementation focused and reusable. You’re not building two menus—you’ll have one menu with multiple ways to open it. I think that’s the cleanest architecture for Clutter.
