// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSidebarVisibility, type NarrowSidebarOverride } from './useSidebarVisibility';

afterEach(cleanup);

function makeWorkspace(isSidebarVisible: boolean) {
  const workspace = {
    isSidebarVisible,
    toggleSidebarVisible: vi.fn(() => {
      workspace.isSidebarVisible = !workspace.isSidebarVisible;
    }),
  };
  return workspace;
}

type Workspace = ReturnType<typeof makeWorkspace>;

interface Latest {
  visibility: ReturnType<typeof useSidebarVisibility>;
  override: NarrowSidebarOverride;
}

/** The layout: rebuilt (a new `key`) for every Space, as `AppShell` does with `AppLayout`. */
function Layout(props: {
  workspace: Workspace;
  isNarrow: boolean;
  override: NarrowSidebarOverride;
  setOverride: (override: NarrowSidebarOverride) => void;
  latest: { current: Latest | null };
}) {
  const visibility = useSidebarVisibility(props.workspace, props.isNarrow, props.override, props.setOverride);
  props.latest.current = { visibility, override: props.override };
  return null;
}

/** The shell: owns the override, above the layout, so it outlives the layout being rebuilt. */
function Shell(props: { workspace: Workspace; isNarrow: boolean; space: string; latest: { current: Latest | null } }) {
  const [override, setOverride] = useState<NarrowSidebarOverride>(null);
  return (
    <Layout
      key={props.space}
      workspace={props.workspace}
      isNarrow={props.isNarrow}
      override={override}
      setOverride={setOverride}
      latest={props.latest}
    />
  );
}

function mount(workspace: Workspace, isNarrow: boolean) {
  const latest: { current: Latest | null } = { current: null };
  const view = render(<Shell workspace={workspace} isNarrow={isNarrow} space="A" latest={latest} />);
  return {
    latest: () => latest.current!,
    toggle: () => act(() => latest.current!.visibility.toggleSidebar()),
    /** Switch Space: the layout is rebuilt; `workspace` is the (carried) preference of the Space switched to. */
    switchSpace: (next: Workspace = workspace) =>
      view.rerender(<Shell workspace={next} isNarrow={isNarrow} space="B" latest={latest} />),
    resize: (narrow: boolean) =>
      view.rerender(<Shell workspace={workspace} isNarrow={narrow} space="A" latest={latest} />),
  };
}

describe('useSidebarVisibility', () => {
  describe('wide window', () => {
    it('follows the manual preference, collapsed or expanded', () => {
      expect(mount(makeWorkspace(true), false).latest().visibility.isSidebarVisible).toBe(true);
      expect(mount(makeWorkspace(false), false).latest().visibility.isSidebarVisible).toBe(false);
    });

    it('toggles the preference, never an override', () => {
      const workspace = makeWorkspace(true);
      const view = mount(workspace, false);

      view.toggle();

      expect(workspace.toggleSidebarVisible).toHaveBeenCalledTimes(1);
      expect(view.latest().override).toBeNull();
    });
  });

  describe('narrow window', () => {
    it('is collapsed whatever the preference; a toggle is a temporary override that leaves the preference alone', () => {
      const workspace = makeWorkspace(true);
      const view = mount(workspace, true);
      expect(view.latest().visibility.isSidebarVisible).toBe(false);

      view.toggle();

      expect(view.latest().visibility.isSidebarVisible).toBe(true);
      expect(view.latest().override).toBe(true);
      expect(workspace.toggleSidebarVisible).not.toHaveBeenCalled();
      expect(workspace.isSidebarVisible).toBe(true);
    });

    it('ends the override when the window is next wide, so it never returns as a stale choice', () => {
      const view = mount(makeWorkspace(true), true);
      view.toggle();
      expect(view.latest().override).toBe(true);

      view.resize(false);
      expect(view.latest().override).toBeNull();

      view.resize(true);
      expect(view.latest().visibility.isSidebarVisible).toBe(false);
    });
  });

  describe('switching Spaces rebuilds the layout', () => {
    it('keeps a narrow window’s sidebar open when the user had opened it (the bug: the rebuilt layout lost the override)', () => {
      const view = mount(makeWorkspace(true), true);
      view.toggle();
      expect(view.latest().visibility.isSidebarVisible).toBe(true);

      view.switchSpace();

      expect(view.latest().visibility.isSidebarVisible).toBe(true);
    });

    it('keeps a narrow window’s sidebar collapsed when it was collapsed', () => {
      const view = mount(makeWorkspace(true), true);
      expect(view.latest().visibility.isSidebarVisible).toBe(false);

      view.switchSpace();

      expect(view.latest().visibility.isSidebarVisible).toBe(false);
    });

    it.each([
      { preference: true, name: 'expanded' },
      { preference: false, name: 'collapsed' },
    ])('keeps a normal-width window’s sidebar $name', ({ preference }) => {
      const view = mount(makeWorkspace(preference), false);

      // The shell carries the user's preference into the Space switched to.
      view.switchSpace(makeWorkspace(preference));

      expect(view.latest().visibility.isSidebarVisible).toBe(preference);
    });

    it('does not turn a switch into a toggle', () => {
      const workspace = makeWorkspace(false);
      const view = mount(workspace, false);

      view.switchSpace();

      expect(workspace.toggleSidebarVisible).not.toHaveBeenCalled();
    });
  });
});
