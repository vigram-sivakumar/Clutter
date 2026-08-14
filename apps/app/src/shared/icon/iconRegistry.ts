/**
 * Maps an icon identifier to the React component that renders it.
 *
 * This is the ONLY file that imports SVGs.
 */

import Archive from './svg/archive.svg?react';
import ArrowDownRight from './svg/arrow-down-right.svg?react';
import ArrowLeft from './svg/arrow-left.svg?react';
import ArrowLeftSmallHead from './svg/arrow-left-small-head.svg?react';
import ArrowRight from './svg/arrow-right.svg?react';
import ArrowRightSmallHead from './svg/arrow-right-small-head.svg?react';
import BookshelfBox from './svg/bookshelf-box.svg?react';
import CalendarBlank from './svg/calendar-blank.svg?react';
import CalendarDot from './svg/calendar-dot.svg?react';
import CaretDown from './svg/caret-down.svg?react';
import CaretLeft from './svg/caret-left.svg?react';
import CaretRight from './svg/caret-right.svg?react';
import CaretUp from './svg/caret-up.svg?react';
import CheckboxChecked from './svg/checkbox-checked.svg?react';
import CheckboxUnchecked from './svg/checkbox-unchecked.svg?react';
import ChevronDown from './svg/chevron-down.svg?react';
import ChevronLeft from './svg/chevron-left.svg?react';
import ChevronRight from './svg/chevron-right.svg?react';
import ChevronSquareRight from './svg/chevron-square-right.svg?react';
import ChevronSquareRightLight from './svg/chevron-square-right-light.svg?react';
import ChevronUp from './svg/chevron-up.svg?react';
import Check from './svg/check.svg?react';
import Copy from './svg/copy.svg?react';
import CircleDashed from './svg/circle-dashed.svg?react';
import Clock from './svg/clock.svg?react';
import Dismiss from './svg/dismiss.svg?react';
import Description from './svg/description.svg?react';
import FavouriteFilled from './svg/favourite-filled.svg?react';
import FavouriteOutline from './svg/favourite-outline.svg?react';
import Folder from './svg/folder.svg?react';
import FolderAdd from './svg/folder-add.svg?react';
import Image from './svg/image.svg?react';
import KeyEsc from './svg/key-esc.svg?react';
import Keyboard from './svg/keyboard.svg?react';
import MagnifyingGlass from './svg/magnifying-glass.svg?react';
import MoreHorizontal from './svg/more-horizontal.svg?react';
import MoreVertical from './svg/more-vertical.svg?react';
import MultiLine from './svg/multi-line.svg?react';
import Note from './svg/note.svg?react';
import Link from './svg/link.svg?react';
import NotePencil from './svg/note-pencil.svg?react';
import Pin from './svg/pin.svg?react';
import Plus from './svg/plus.svg?react';
import Question from './svg/question.svg?react';
import Restore from './svg/restore.svg?react';
import Settings from './svg/settings.svg?react';
import Sidebar from './svg/sidebar.svg?react';
import Slash from './svg/slash.svg?react';
import Square from './svg/square.svg?react';
import SquareCheckOutline from './svg/square-check-outline.svg?react';
import SquareDashed from './svg/square-dashed.svg?react';
import SquareExpand from './svg/square-expand.svg?react';
import SquareFill from './svg/square-fill.svg?react';
import SquareHug from './svg/square-hug.svg?react';
import SquiggleLine from './svg/squiggle-line.svg?react';
import Tabs from './svg/tabs.svg?react';
import TabsFlat from './svg/tabs-flat.svg?react';
import Tag from './svg/tag.svg?react';
import Template from './svg/template.svg?react';
import Tick from './svg/tick.svg?react';
import Tray from './svg/tray.svg?react';
import Trash from './svg/trash.svg?react';
import WidthFill from './svg/width-fill.svg?react';
import WidthHug from './svg/width-hug.svg?react';

import { CalendarTodayIcon } from './svg/calendar-today';

export const iconRegistry = {
  archive: Archive,
  arrowDownRight: ArrowDownRight,
  arrowLeft: ArrowLeft,
  arrowLeftSmallHead: ArrowLeftSmallHead,
  arrowRight: ArrowRight,
  arrowRightSmallHead: ArrowRightSmallHead,
  bookshelfBox: BookshelfBox,
  calendar: CalendarBlank,
  calendarDot: CalendarDot,
  calendarToday: CalendarTodayIcon,
  caretDown: CaretDown,
  caretLeft: CaretLeft,
  caretRight: CaretRight,
  caretUp: CaretUp,
  checkboxChecked: CheckboxChecked,
  checkboxUnchecked: CheckboxUnchecked,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronSquareRight: ChevronSquareRight,
  chevronSquareRightLight: ChevronSquareRightLight,
  chevronUp: ChevronUp,
  check: Check,
  copy: Copy,
  circleDashed: CircleDashed,
  clock: Clock,
  dismiss: Dismiss,
  description: Description,
  favouriteFilled: FavouriteFilled,
  favouriteOutline: FavouriteOutline,
  folder: Folder,
  folderAdd: FolderAdd,
  image: Image,
  keyEsc: KeyEsc,
  keyboard: Keyboard,
  magnifyingGlass: MagnifyingGlass,
  moreHorizontal: MoreHorizontal,
  moreVertical: MoreVertical,
  multiLine: MultiLine,
  note: Note,
  notePencil: NotePencil,
  link: Link,
  pin: Pin,
  plus: Plus,
  question: Question,
  restore: Restore,
  settings: Settings,
  sidebar: Sidebar,
  slash: Slash,
  square: Square,
  squareCheckOutline: SquareCheckOutline,
  squareDashed: SquareDashed,
  squareExpand: SquareExpand,
  squareFill: SquareFill,
  squareHug: SquareHug,
  squiggleLine: SquiggleLine,
  tabs: Tabs,
  tabsFlat: TabsFlat,
  tag: Tag,
  template: Template,
  tick: Tick,
  tray: Tray,
  trash: Trash,
  widthFill: WidthFill,
  widthHug: WidthHug,
} as const;
