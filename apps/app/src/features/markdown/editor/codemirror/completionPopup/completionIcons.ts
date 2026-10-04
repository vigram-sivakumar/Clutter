/**
 * The popup row icons as raw `<svg>` markup. `Completion.render` must return plain DOM built
 * synchronously outside React, so `AppIcon` (a React component) can't be used; these are the
 * same SVG files `iconRegistry.ts` maps, in `currentColor`.
 */
import calendarBlank from '@shared/icon/svg/calendar-blank.svg?raw';
import calendarDot from '@shared/icon/svg/calendar-dot.svg?raw';
import calendarNote from '@shared/icon/svg/calendar-note.svg?raw';
import hash from '@shared/icon/svg/hash.svg?raw';
import image from '@shared/icon/svg/image.svg?raw';
import moreHorizontal from '@shared/icon/svg/more-horizontal.svg?raw';
import note from '@shared/icon/svg/note.svg?raw';
import pdf from '@shared/icon/svg/pdf.svg?raw';
import plus from '@shared/icon/svg/plus.svg?raw';
import tag from '@shared/icon/svg/tag.svg?raw';

export const COMPLETION_ICONS = { calendarBlank, calendarDot, calendarNote, hash, image, moreHorizontal, note, pdf, plus, tag } as const;
