// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { systemIconSvg } from '@shared/icon';

import { WikiLinkWidget } from './WikiLinkWidget';
import type { WikiLinkResolution } from './wikiLinkResolution';

/** The icon as the widget leaves it in the DOM: serialized by the DOM, with the widget's own icon class. */
const asDom = (markup: string): string => {
  const holder = document.createElement('span');
  holder.innerHTML = markup;
  holder.querySelector('svg')?.classList.add('tok-wikilink__icon');
  return holder.innerHTML;
};

const folder = (icon: 'folder' | 'tray', targetId = 'f1'): WikiLinkResolution => ({
  status: 'resolved',
  targetKind: 'folder',
  targetId,
  displayLabel: 'Inbox',
  activate: () => {},
  icon,
  emoji: null,
});

describe('WikiLinkWidget — links to folders and assets', () => {
  it('draws a folder link with the registry icon it names, in the same icon + title structure as a note link', () => {
    const dom = new WikiLinkWidget('Inbox/', null, folder('tray')).toDOM();

    expect(dom.dataset.wikilinkStatus).toBe('resolved');
    expect(dom.querySelector('.tok-wikilink__icon-wrap')?.innerHTML).toBe(asDom(systemIconSvg('tray')));
    expect(dom.querySelector('.tok-wikilink__title')?.textContent).toBe('Inbox');
  });

  it('draws an image and a PDF link with the image and PDF icons', () => {
    const asset = (targetKind: 'image' | 'pdf'): WikiLinkResolution => ({
      status: 'resolved',
      targetKind,
      targetId: 'r1',
      displayLabel: 'x',
      activate: () => {},
      icon: targetKind,
      emoji: null,
    });

    expect(new WikiLinkWidget('a.png', null, asset('image')).toDOM().querySelector('.tok-wikilink__icon-wrap')?.innerHTML).toBe(asDom(systemIconSvg('image')));
    expect(new WikiLinkWidget('a.pdf', null, asset('pdf')).toDOM().querySelector('.tok-wikilink__icon-wrap')?.innerHTML).toBe(asDom(systemIconSvg('pdf')));
  });

  it('draws an image link as its picture, falling back to the image icon if the file fails to load', () => {
    const image: WikiLinkResolution = {
      status: 'resolved',
      targetKind: 'image',
      targetId: 'r1',
      displayLabel: 'x',
      activate: () => {},
      icon: 'image',
      emoji: null,
      previewUrl: 'asset://hero.png',
    };
    const dom = new WikiLinkWidget('a.png', null, image).toDOM();
    const img = dom.querySelector<HTMLImageElement>('.tok-wikilink__icon-wrap img.tok-wikilink__thumbnail');

    expect(img?.getAttribute('src')).toBe('asset://hero.png');
    img?.dispatchEvent(new Event('error'));
    expect(dom.querySelector('.tok-wikilink__icon-wrap')?.innerHTML).toBe(asDom(systemIconSvg('image')));
  });

  it('a note link is drawn exactly as before', () => {
    const note: WikiLinkResolution = { status: 'resolved', pageId: 'p', displayLabel: 'Plan', activate: () => {}, icon: 'note', emoji: null };

    expect(new WikiLinkWidget('Plan', null, note).toDOM().querySelector('.tok-wikilink__icon-wrap svg')).not.toBeNull();
  });

  it('is the same widget only for the same target and icon (so a retarget or an icon change redraws)', () => {
    const base = new WikiLinkWidget('Inbox/', null, folder('tray'));

    expect(base.eq(new WikiLinkWidget('Inbox/', null, folder('tray')))).toBe(true);
    expect(base.eq(new WikiLinkWidget('Inbox/', null, folder('folder')))).toBe(false);
    expect(base.eq(new WikiLinkWidget('Inbox/', null, folder('tray', 'f2')))).toBe(false);
  });
});
