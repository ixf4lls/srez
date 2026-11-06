import {
  Add as IconAdd,
  ArrowDown2 as IconArrowDown,
  ArrowLeft as IconArrowLeft,
  ArrowRight as IconArrowRight,
  ArrowRight2 as IconArrowRightSmall,
  ArrowRotateLeft as IconUndo,
  Briefcase as IconBriefcase,
  Calendar as IconCalendar,
  Clock as IconClock,
  CloseCircle as IconClose,
  Danger as IconDanger,
  Data as IconData,
  DocumentText as IconDocument,
  ExportSquare as IconExternal,
  Filter as IconFilter,
  Layer as IconLayer,
  Location as IconLocation,
  Maximize1 as IconMaximize,
  Pause as IconPause,
  People as IconPeople,
  Play as IconPlay,
  Refresh2 as IconRefresh,
  SearchNormal as IconSearch,
  ShieldTick as IconShield,
  TickCircle as IconTick,
  Trash as IconTrash,
} from 'iconsax-react';
import type {Icon,IconProps} from 'iconsax-react';

// Iconsax Broken is the icon treatment in the referenced Figma kit.
function broken(Component:Icon):Icon {
  return function BrokenIcon(props:IconProps) {
    return <Component {...props} color={props.color ?? 'currentColor'} size={props.size ?? 24} variant="Broken"/>;
  };
}

export const Search=broken(IconSearch);
export const SlidersHorizontal=broken(IconFilter);
export const ChevronDown=broken(IconArrowDown);
export const Check=broken(IconTick);
export const LoaderCircle=broken(IconRefresh);
export const BriefcaseBusiness=broken(IconBriefcase);
export const Layers3=broken(IconLayer);
export const RotateCcw=broken(IconUndo);
export const AlertCircle=broken(IconDanger);
export const ArrowRight=broken(IconArrowRight);
export const ArrowLeft=broken(IconArrowLeft);
export const ChevronRight=broken(IconArrowRightSmall);
export const Plus=broken(IconAdd);
export const Trash2=broken(IconTrash);
export const Undo2=broken(IconUndo);
export const X=broken(IconClose);
export const CalendarDays=broken(IconCalendar);
export const Clock3=broken(IconClock);
export const Database=broken(IconData);
export const ExternalLink=broken(IconExternal);
export const FileText=broken(IconDocument);
export const MapPin=broken(IconLocation);
export const Users=broken(IconPeople);
export const Expand=broken(IconMaximize);
export const Pause=broken(IconPause);
export const Play=broken(IconPlay);
export const RefreshCw=broken(IconRefresh);
export const ShieldCheck=broken(IconShield);
