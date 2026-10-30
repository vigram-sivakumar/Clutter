// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsSidebar } from './SettingsSidebar';

afterEach(cleanup);

const row = (title: string) =>
  screen.getByText(title).closest('.entry') as HTMLElement;

describe('SettingsSidebar', () => {
  it('shows General → Preferences, Features → Daily notes and Editor → Layout', () => {
    render(<SettingsSidebar selectedId="preferences" onSelect={() => {}} />);
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Features')).toBeInTheDocument();
    expect(screen.getByText('Editor')).toBeInTheDocument();
    expect(screen.getByText('Layout')).toBeInTheDocument();
  });

  it('lists Notes above Daily notes under Features, each on its own location icon', () => {
    render(<SettingsSidebar selectedId="preferences" onSelect={() => {}} />);
    const notes = row('Notes');
    const daily = row('Daily notes');
    expect(
      notes.compareDocumentPosition(daily) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(notes.querySelector('.entry__leading svg')).not.toBeNull();
    expect(notes.querySelector('[data-icon="settings"]')).toBeNull();
  });

  it('puts Layout under its own Editor section, after Features, and reports it by id', () => {
    const onSelect = vi.fn();
    render(<SettingsSidebar selectedId="preferences" onSelect={onSelect} />);

    expect(
      screen.getByText('Features').compareDocumentPosition(screen.getByText('Editor')) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    fireEvent.click(screen.getByText('Layout'));
    expect(onSelect).toHaveBeenCalledWith('layout');
  });

  it('lists Markdown after Layout under Editor, and reports it by id', () => {
    const onSelect = vi.fn();
    render(<SettingsSidebar selectedId="preferences" onSelect={onSelect} />);

    expect(
      row('Layout').compareDocumentPosition(row('Markdown')) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    fireEvent.click(screen.getByText('Markdown'));
    expect(onSelect).toHaveBeenCalledWith('markdown');
  });

  it('draws the layout icon for Layout', () => {
    render(<SettingsSidebar selectedId="preferences" onSelect={() => {}} />);

    expect(row('Layout').querySelector('[data-icon="layout"]')).not.toBeNull();
  });

  it('reports a click on Notes by its stable id', () => {
    const onSelect = vi.fn();
    render(<SettingsSidebar selectedId="preferences" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Notes'));
    expect(onSelect).toHaveBeenCalledWith('notes');
  });

  it('draws the settings icon for Preferences', () => {
    render(<SettingsSidebar selectedId="preferences" onSelect={() => {}} />);
    expect(
      row('Preferences').querySelector(
        '.entry__leading [data-icon="settings"] svg'
      )
    ).not.toBeNull();
  });

  it('keeps Daily notes on its own location icon, not the settings one', () => {
    render(<SettingsSidebar selectedId="preferences" onSelect={() => {}} />);
    const leading = row('Daily notes').querySelector('.entry__leading')!;
    expect(leading.querySelector('svg')).not.toBeNull();
    expect(leading.querySelector('[data-icon="settings"]')).toBeNull();
  });

  it('marks the selected page and reports a click by its stable id', () => {
    const onSelect = vi.fn();
    render(<SettingsSidebar selectedId="daily-notes" onSelect={onSelect} />);
    expect(row('Daily notes')).toHaveClass('entry-selected');
    expect(row('Preferences')).not.toHaveClass('entry-selected');
    fireEvent.click(screen.getByText('Preferences'));
    expect(onSelect).toHaveBeenCalledWith('preferences');
  });
});
