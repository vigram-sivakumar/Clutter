import { WidgetType } from '@codemirror/view';

export type DividerKind = 'straight' | 'wavy' | 'double' | 'dotted';

const KIND_MODIFIER_CLASS: Readonly<Record<DividerKind, string | null>> = {
  straight: null,
  wavy: 'cm-hr-labeled--wavy',
  double: 'cm-hr-labeled--double',
  dotted: 'cm-hr-labeled--dotted',
};

/**
 * The at-rest rendered form of a *labeled* divider (`---Text---`,
 * `~---Text---~`, `=---Text---=`, `.---Text---.`) — a
 * `Decoration.replace({widget})` standing in for the whole raw line, same
 * mechanism `ListBulletWidget`/`WikiLinkWidget` already use in this
 * codebase for at-rest content that needs to render something CSS alone
 * can't (real, dynamic text, here).
 *
 * The unlabeled variants stay on the pure-CSS `::after`-pseudo-element
 * technique in `horizontalRuleDecoration.ts`/`MarkdownEditor.css`
 * (`.cm-hr-line`/`-wavy`/`-double`/`-dotted`) — that technique works
 * because the line has no real content to show, just a painted line. A
 * label needs actual text in the DOM, so this widget renders three real
 * children instead: a rule segment, the label, and a second rule segment,
 * laid out with flexbox so the label sits centered between two
 * equal-width rule segments. Each `cm-hr-labeled--{kind}` modifier class
 * (see `MarkdownEditor.css`) reuses the exact same `background`/
 * `mask-image` declarations the unlabeled `::after` rules already use for
 * that kind, just applied to a real flex child instead of a pseudo-element
 * — the straight kind needs no modifier, its rule segment is a plain 1px
 * bar.
 */
export class DividerLabelWidget extends WidgetType {
  constructor(
    private readonly kind: DividerKind,
    private readonly label: string
  ) {
    super();
  }

  override eq(other: DividerLabelWidget): boolean {
    return other.kind === this.kind && other.label === this.label;
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-hr-labeled';
    const modifier = KIND_MODIFIER_CLASS[this.kind];
    if (modifier) {
      wrapper.classList.add(modifier);
    }

    const left = document.createElement('span');
    left.className = 'cm-hr-labeled__rule';
    wrapper.appendChild(left);

    const text = document.createElement('span');
    text.className = 'cm-hr-labeled__text';
    text.textContent = this.label;
    wrapper.appendChild(text);

    const right = document.createElement('span');
    right.className = 'cm-hr-labeled__rule';
    wrapper.appendChild(right);

    return wrapper;
  }

  /**
   * Same reasoning as `ListBulletWidget.ignoreEvent`: no click behavior of
   * its own, so letting `mousedown` through to CM6's built-in
   * click-to-position handling lets a click anywhere on the divider land
   * the caret on its line and engage it, same as clicking any other line.
   */
  override ignoreEvent(): boolean {
    return false;
  }
}
