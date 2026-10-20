// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SettingsEntry } from '../settings-entry/SettingsEntry';
import { SettingsGroup } from '../settings-group/SettingsGroup';
import { SettingsSection } from './SettingsSection';

afterEach(cleanup);

describe('SettingsSection', () => {
  const renderSection = () =>
    render(
      <SettingsSection title="Template">
        <SettingsGroup>
          <SettingsEntry title="Default" />
        </SettingsGroup>
        <SettingsGroup>
          {[<SettingsEntry key="a" title="Preferred templates" />, <SettingsEntry key="b" title="Another" />]}
        </SettingsGroup>
      </SettingsSection>
    );

  it('shows its title once, above every group', () => {
    renderSection();
    expect(screen.getAllByText('Template')).toHaveLength(1);
    const section = document.querySelector('.settings-section')!;
    expect(section.firstElementChild).toHaveTextContent('Template');
    expect(section.firstElementChild?.compareDocumentPosition(document.querySelector('.settings-group')!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('keeps each group its own card, with its own dividers', () => {
    renderSection();
    const groups = document.querySelectorAll('.settings-section__groups > .settings-group');
    expect(groups).toHaveLength(2);
    expect(groups[0]?.querySelectorAll('.settings-group__divider')).toHaveLength(0);
    expect(groups[1]?.querySelectorAll('.settings-group__divider')).toHaveLength(1);
  });

  it('lets a caller add a class', () => {
    render(
      <SettingsSection title="T" className="extra">
        <SettingsGroup>
          <SettingsEntry title="One" />
        </SettingsGroup>
      </SettingsSection>
    );
    expect(document.querySelector('.settings-section')).toHaveClass('extra');
  });
});
