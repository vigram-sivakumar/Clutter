import ArchiveRaw from './svg/archive.svg?react';
import ArrowLeftRaw from './svg/arrow-left.svg?react';
import ArrowLeftSmallHeadRaw from './svg/arrow-left-small-head.svg?react';
import ArrowRightRaw from './svg/arrow-right.svg?react';
import ArrowRightSmallHeadRaw from './svg/arrow-right-small-head.svg?react';
import CalendarBlankRaw from './svg/calendar-blank.svg?react';
import CaretDownRaw from './svg/caret-down.svg?react';
import CaretLeftRaw from './svg/caret-left.svg?react';
import CaretRightRaw from './svg/caret-right.svg?react';
import CaretUpRaw from './svg/caret-up.svg?react';
import CheckboxCheckedRaw from './svg/checkbox-checked.svg?react';
import CheckboxUncheckedRaw from './svg/checkbox-unchecked.svg?react';
import ChevronDownRaw from './svg/chevron-down.svg?react';
import ChevronLeftRaw from './svg/chevron-left.svg?react';
import ChevronRightRaw from './svg/chevron-right.svg?react';
import ChevronSquareRightRaw from './svg/chevron-square-right.svg?react';
import ChevronSquareRightLightRaw from './svg/chevron-square-right-light.svg?react';
import ChevronUpRaw from './svg/chevron-up.svg?react';
import ClockRaw from './svg/clock.svg?react';
import CircleDashedRaw from './svg/circle-dashed.svg?react';
import FavouriteFilledRaw from './svg/favourite-filled.svg?react';
import FavouriteOutlineRaw from './svg/favourite-outline.svg?react';
import FolderAddRaw from './svg/folder-add.svg?react';
import FolderRaw from './svg/folder.svg?react';
import KeyEscRaw from './svg/key-esc.svg?react';
import KeyboardRaw from './svg/keyboard.svg?react';
import MagnifyingGlassRaw from './svg/magnifying-glass.svg?react';
import MoreHorizontalRaw from './svg/more-horizontal.svg?react';
import NotePencilRaw from './svg/note-pencil.svg?react';
import NoteRaw from './svg/note.svg?react';
import PinRaw from './svg/pin.svg?react';
import PlusRaw from './svg/plus.svg?react';
import QuestionRaw from './svg/question.svg?react';
import SidebarRaw from './svg/sidebar.svg?react';
import SettingsRaw from './svg/settings.svg?react';
import SquareRaw from './svg/square.svg?react';
import SquareCheckOutlineRaw from './svg/square-check-outline.svg?react';
import SquareDashedRaw from './svg/square-dashed.svg?react';
import SquareExpandRaw from './svg/square-expand.svg?react';
import SquareFillRaw from './svg/square-fill.svg?react';
import SquareHugRaw from './svg/square-hug.svg?react';
import TabsRaw from './svg/tabs.svg?react';
import TabsFlatRaw from './svg/tabs-flat.svg?react';
import TagRaw from './svg/tag.svg?react';
import TemplateRaw from './svg/template.svg?react';
import TrayRaw from './svg/tray.svg?react';
import TrashRaw from './svg/trash.svg?react';
import WidthFillRaw from './svg/width-fill.svg?react';
import WidthHugRaw from './svg/width-hug.svg?react';

import {
  CalendarWithDotIcon,
  type CalendarWithDotIconProps,
} from './calendar-with-dot-icon';
import { withSvgIcon } from './svg-icon';

export {
  CalendarTodayIcon,
  type CalendarTodayIconProps,
} from './calendar-today-icon';
export { CalendarWithDotIcon, type CalendarWithDotIconProps };
export {
  ICON_EXTRA_LARGE,
  ICON_EXTRA_SMALL,
  ICON_LARGE,
  ICON_LARGE_WRAPPER,
  ICON_MEDIUM,
  ICON_MEDIUM_WRAPPER,
  ICON_SMALL,
  ICON_SMALL_WRAPPER,
  ICON_STROKE_USER,
} from './constants';
export {
  withSvgIcon,
  type ClutterIcon,
  type CustomSvgIconProps,
} from './svg-icon';

/** Figma / custom SVGs (SVGR). Prefer `stroke="currentColor"` in source; size via props. */
export const CustomIcons = {
  /** Figma archive box + lid + slot stroke. Phosphor `Icons.Archive` stays separate. */
  Archive: withSvgIcon(ArchiveRaw),
  /** Figma arrow left (shaft + head). Phosphor `Icons.ArrowLeft` stays separate. */
  ArrowLeft: withSvgIcon(ArrowLeftRaw),
  /** Figma arrow left with tighter head (vs `ArrowLeft`). */
  ArrowLeftSmallHead: withSvgIcon(ArrowLeftSmallHeadRaw),
  /** Figma arrow right (shaft + head). Phosphor `Icons.ArrowRight` stays separate. */
  ArrowRight: withSvgIcon(ArrowRightRaw),
  /** Figma arrow right with tighter head (vs `ArrowRight`). */
  ArrowRightSmallHead: withSvgIcon(ArrowRightSmallHeadRaw),
  /** Figma calendar outline (no date). Phosphor `Icons.CalendarBlank` stays separate. */
  CalendarBlank: withSvgIcon(CalendarBlankRaw),
  /** Figma calendar + accent dot (frame from `calendar-blank.svg`). Phosphor equivalents stay separate. */
  CalendarWithDot: CalendarWithDotIcon,
  /** Figma compact caret down (`12×12` viewBox, `stroke-width` 1.25). Phosphor `Icons.CaretDown` stays separate from `ChevronDown`. */
  CaretDown: withSvgIcon(CaretDownRaw),
  /** Figma compact caret left (`12×12` viewBox, `stroke-width` 1.25). Phosphor `Icons.CaretLeft` stays separate from `ChevronLeft`. */
  CaretLeft: withSvgIcon(CaretLeftRaw),
  /** Figma compact caret right (`12×12` viewBox, `stroke-width` 1.25). Phosphor `Icons.CaretRight` stays separate from `ChevronRight`. */
  CaretRight: withSvgIcon(CaretRightRaw),
  /** Figma compact caret up (`12×12` viewBox, `stroke-width` 1.25). Phosphor `Icons.CaretUp` stays separate from `ChevronUp`. */
  CaretUp: withSvgIcon(CaretUpRaw),
  /** Figma chevron down stroke. Phosphor `Icons.CaretDown` / `CaretCircleDown` stay separate. */
  ChevronDown: withSvgIcon(ChevronDownRaw),
  /** Figma chevron left stroke. Phosphor `Icons.CaretLeft` stays separate. */
  ChevronLeft: withSvgIcon(ChevronLeftRaw),
  /** Figma chevron right stroke only. Phosphor `Icons.CaretRight` stays separate; see `ChevronSquareRight*`. */
  ChevronRight: withSvgIcon(ChevronRightRaw),
  /** Figma rounded square + chevron right; single 1.2 stroke (vs `ChevronSquareRightLight`). */
  ChevronSquareRight: withSvgIcon(ChevronSquareRightRaw),
  /** Figma rounded square (0.75 stroke) + chevron right (1.25 stroke). Lighter than default chevrons. */
  ChevronSquareRightLight: withSvgIcon(ChevronSquareRightLightRaw),
  /** Figma chevron up stroke. Phosphor `Icons.CaretUp` stays separate. */
  ChevronUp: withSvgIcon(ChevronUpRaw),
  /** Figma clock face + hands (`stroke-width` 1.25). Phosphor `Icons.Clock` stays separate. */
  Clock: withSvgIcon(ClockRaw),
  /** Dashed ring — use `color` / `className` for tone (e.g. `var(--icon-secondary)`). */
  CircleDashed: withSvgIcon(CircleDashedRaw),
  /** Figma task checkbox — checked (16×16); fill/stroke use `--checkbox-*` theme tokens. */
  CheckboxChecked: withSvgIcon(CheckboxCheckedRaw),
  /** Figma task checkbox — unchecked (16×16); `color` → border via `currentColor`. */
  CheckboxUnchecked: withSvgIcon(CheckboxUncheckedRaw),
  /** Figma filled star + outline. Phosphor `Icons.Star` / `StarFilled` stay separate. */
  FavouriteFilled: withSvgIcon(FavouriteFilledRaw),
  /** Figma star stroke only. Phosphor `Icons.Star` stays separate. */
  FavouriteOutline: withSvgIcon(FavouriteOutlineRaw),
  /** Figma folder tab + body; inner fold line uses 1px stroke (1 user unit), outer 1.2. */
  Folder: withSvgIcon(FolderRaw),
  /** Figma folder + centered plus; plus uses 1 user unit stroke, outline 1.2. */
  FolderAdd: withSvgIcon(FolderAddRaw),
  /** Figma Esc key cap + vector ESC label (`fill-opacity` 0.6). Phosphor `Icons.Escape` stays separate. */
  KeyEsc: withSvgIcon(KeyEscRaw),
  /** Figma keyboard frame, space row, and key caps. Phosphor `Icons.Keyboard` stays separate. */
  Keyboard: withSvgIcon(KeyboardRaw),
  /** Figma search: lens + handle (`stroke-width` 1.25). Phosphor `Icons.MagnifyingGlass` stays separate. */
  MagnifyingGlass: withSvgIcon(MagnifyingGlassRaw),
  /** Figma three filled dots (overflow / more). Phosphor `Icons.DotsThree` / `Icons.DotsThreeHorizontal` stay separate. */
  MoreHorizontal: withSvgIcon(MoreHorizontalRaw),
  /** Figma note (lines) — `currentColor` stroke; Phosphor `Icons.Note` stays separate. */
  Note: withSvgIcon(NoteRaw),
  /** Figma note + edit stroke + dot — Phosphor `Icons.NotePencil` stays separate. */
  NotePencil: withSvgIcon(NotePencilRaw),
  /** Figma pushpin + point stroke. */
  Pin: withSvgIcon(PinRaw),
  /** Figma plus (vertical + horizontal). Phosphor `Icons.Plus` stays separate. */
  Plus: withSvgIcon(PlusRaw),
  /** Help / “?” — text glyph until a Figma stroke asset replaces it. */
  Question: withSvgIcon(QuestionRaw),
  /** Figma panel + rail stroke. Phosphor `Icons.SidebarSimple` stays separate. */
  Sidebar: withSvgIcon(SidebarRaw),
  /** Figma rounded panel + two slider rows. Phosphor `Icons.SlidersHorizontal` / `Icons.Gear` stay separate. */
  Settings: withSvgIcon(SettingsRaw),
  /** Figma rounded square outline. Phosphor `Icons.Square` stays separate. */
  Square: withSvgIcon(SquareRaw),
  /** Figma rounded square with check stroke. Phosphor `Icons.CheckSquare` stays separate. */
  SquareCheckOutline: withSvgIcon(SquareCheckOutlineRaw),
  /** Figma dashed / segmented square frame. */
  SquareDashed: withSvgIcon(SquareDashedRaw),
  /** Figma rounded square + horizontal expand arrows. */
  SquareExpand: withSvgIcon(SquareExpandRaw),
  /** Figma soft fill + hairline stroke; set tint with `color` / `style={{ color: … }}` on the icon (both use `currentColor`). */
  SquareFill: withSvgIcon(SquareFillRaw),
  /** Figma rounded square + horizontal squeeze arrows. */
  SquareHug: withSvgIcon(SquareHugRaw),
  /** Figma panel + muted thick top tab stroke (`opacity` 0.24 ≈ design 0.4×0.6). */
  Tabs: withSvgIcon(TabsRaw),
  /** Figma stacked / folder-tab style panel stroke (flat tabs). */
  TabsFlat: withSvgIcon(TabsFlatRaw),
  /** Figma price-tag shape + hole. Phosphor `Icons.Tag` stays separate. */
  Tag: withSvgIcon(TagRaw),
  /** Figma frame, corner plus (`stroke-width` 1), muted lines (`opacity` 0.3). */
  Template: withSvgIcon(TemplateRaw),
  /** Figma inbox / tray. Phosphor `Icons.Tray` stays separate. */
  Tray: withSvgIcon(TrayRaw),
  /** Figma wastebasket stroke. Phosphor `Icons.Trash` stays separate. */
  Trash: withSvgIcon(TrashRaw),
  /** Figma vertical rails + horizontal expand arrows (widen width). */
  WidthFill: withSvgIcon(WidthFillRaw),
  /** Figma vertical rails + horizontal squeeze arrows (narrow width). */
  WidthHug: withSvgIcon(WidthHugRaw),
} as const;
