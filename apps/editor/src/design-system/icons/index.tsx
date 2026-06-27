import type { ComponentType, SVGProps } from 'react';

import Archive from './svg/archive.svg?react';
import ArrowLeft from './svg/arrow-left.svg?react';
import ArrowLeftSmallHead from './svg/arrow-left-small-head.svg?react';
import ArrowRight from './svg/arrow-right.svg?react';
import ArrowRightSmallHead from './svg/arrow-right-small-head.svg?react';
import CalendarBlank from './svg/calendar-blank.svg?react';
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
import CircleDashed from './svg/circle-dashed.svg?react';
import Clock from './svg/clock.svg?react';
import FavouriteFilled from './svg/favourite-filled.svg?react';
import FavouriteOutline from './svg/favourite-outline.svg?react';
import Folder from './svg/folder.svg?react';
import FolderAdd from './svg/folder-add.svg?react';
import KeyEsc from './svg/key-esc.svg?react';
import Keyboard from './svg/keyboard.svg?react';
import MagnifyingGlass from './svg/magnifying-glass.svg?react';
import MoreHorizontal from './svg/more-horizontal.svg?react';
import Note from './svg/note.svg?react';
import NotePencil from './svg/note-pencil.svg?react';
import Pin from './svg/pin.svg?react';
import Plus from './svg/plus.svg?react';
import Question from './svg/question.svg?react';
import Settings from './svg/settings.svg?react';
import Sidebar from './svg/sidebar.svg?react';
import Square from './svg/square.svg?react';
import SquareCheckOutline from './svg/square-check-outline.svg?react';
import SquareDashed from './svg/square-dashed.svg?react';
import SquareExpand from './svg/square-expand.svg?react';
import SquareFill from './svg/square-fill.svg?react';
import SquareHug from './svg/square-hug.svg?react';
import Tabs from './svg/tabs.svg?react';
import TabsFlat from './svg/tabs-flat.svg?react';
import Tag from './svg/tag.svg?react';
import Template from './svg/template.svg?react';
import Tray from './svg/tray.svg?react';
import Trash from './svg/trash.svg?react';
import WidthFill from './svg/width-fill.svg?react';
import WidthHug from './svg/width-hug.svg?react';

import { CalendarTodayIcon } from './calendar-today-icon';
import { CalendarWithDotIcon } from './calendar-with-dot-icon';

const DEFAULT_ICON_SIZE = 16;
const DEFAULT_ICON_STROKE_WIDTH = 1.2;

function createIcon(Icon: ComponentType<SVGProps<SVGSVGElement>>) {
  return (props: SVGProps<SVGSVGElement>) => (
    <Icon
      width={DEFAULT_ICON_SIZE}
      height={DEFAULT_ICON_SIZE}
      strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
      {...props}
    />
  );
}

export const Icons = {
  Archive: createIcon(Archive),
  ArrowLeft: createIcon(ArrowLeft),
  ArrowLeftSmallHead: createIcon(ArrowLeftSmallHead),
  ArrowRight: createIcon(ArrowRight),
  ArrowRightSmallHead: createIcon(ArrowRightSmallHead),

  CalendarBlank: createIcon(CalendarBlank),
  CalendarToday: CalendarTodayIcon,
  CalendarWithDot: CalendarWithDotIcon,

  CaretDown: createIcon(CaretDown),
  CaretLeft: createIcon(CaretLeft),
  CaretRight: createIcon(CaretRight),
  CaretUp: createIcon(CaretUp),

  CheckboxChecked: createIcon(CheckboxChecked),
  CheckboxUnchecked: createIcon(CheckboxUnchecked),

  ChevronDown: createIcon(ChevronDown),
  ChevronLeft: createIcon(ChevronLeft),
  ChevronRight: createIcon(ChevronRight),
  ChevronSquareRight: createIcon(ChevronSquareRight),
  ChevronSquareRightLight: createIcon(ChevronSquareRightLight),
  ChevronUp: createIcon(ChevronUp),

  CircleDashed: createIcon(CircleDashed),
  Clock: createIcon(Clock),

  FavouriteFilled: createIcon(FavouriteFilled),
  FavouriteOutline: createIcon(FavouriteOutline),

  Folder: createIcon(Folder),
  FolderAdd: createIcon(FolderAdd),

  KeyEsc: createIcon(KeyEsc),
  Keyboard: createIcon(Keyboard),

  MagnifyingGlass: createIcon(MagnifyingGlass),
  MoreHorizontal: createIcon(MoreHorizontal),

  Note: createIcon(Note),
  NotePencil: createIcon(NotePencil),

  Pin: createIcon(Pin),
  Plus: createIcon(Plus),
  Question: createIcon(Question),

  Settings: createIcon(Settings),
  Sidebar: createIcon(Sidebar),

  Square: createIcon(Square),
  SquareCheckOutline: createIcon(SquareCheckOutline),
  SquareDashed: createIcon(SquareDashed),
  SquareExpand: createIcon(SquareExpand),
  SquareFill: createIcon(SquareFill),
  SquareHug: createIcon(SquareHug),

  Tabs: createIcon(Tabs),
  TabsFlat: createIcon(TabsFlat),

  Tag: createIcon(Tag),
  Template: createIcon(Template),

  Tray: createIcon(Tray),
  Trash: createIcon(Trash),

  WidthFill: createIcon(WidthFill),
  WidthHug: createIcon(WidthHug),
} as const;
