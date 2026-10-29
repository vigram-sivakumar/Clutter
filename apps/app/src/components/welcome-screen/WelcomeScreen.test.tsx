// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fail = vi.fn();
vi.mock('../toast/ToastProvider', () => ({ useToast: () => ({ fail, show: vi.fn(), dismiss: vi.fn() }) }));

import { WelcomeScreen } from './WelcomeScreen';

beforeEach(() => {
  fail.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(cleanup);

const TOO_BROAD = 'That folder is too broad to be a space (your home folder or the disk root). Choose a more specific folder';

function setup(onSelectFolder: () => Promise<string | null>, onCreateSpace: () => Promise<string | null> = async () => null) {
  render(<WelcomeScreen onSelectFolder={onSelectFolder} onCreateSpace={onCreateSpace} />);
}
const select = () => act(async () => screen.getByText('Select a folder').click());
const createNew = () => act(async () => screen.getByText('Create a new space').click());

describe('WelcomeScreen: a refused choice is shown inline (docs/writing-principles.md, "Choose the surface")', () => {
  it('a refused folder is explained under the actions, with no toast, and the screen stays', async () => {
    setup(async () => TOO_BROAD);

    await select();

    expect(screen.getByRole('alert')).toHaveTextContent('too broad to be a space');
    expect(fail).not.toHaveBeenCalled();
    expect(screen.getByText('Select a folder')).toBeInTheDocument(); // another folder can be chosen
  });

  it('the message is replaced by the next attempt and gone when it succeeds', async () => {
    const answers = [TOO_BROAD, 'Couldn’t find your Documents folder', null];
    setup(async () => answers.shift() ?? null, async () => answers.shift() ?? null);

    await select();
    expect(screen.getByRole('alert')).toHaveTextContent('too broad');
    await createNew();
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t find your Documents folder');
    await select();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('an unexpected failure is still a toast, not an inline message about a choice', async () => {
    setup(async () => {
      throw new Error('boom');
    });

    await select();

    expect(fail).toHaveBeenCalledWith('Couldn’t set up the space', expect.any(Error));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
