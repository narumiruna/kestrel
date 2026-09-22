import {
  ArrowDownIcon as RadixArrowDownIcon,
  ArrowRightIcon as RadixArrowRightIcon,
  ArrowUpIcon as RadixArrowUpIcon,
  BorderLeftIcon as RadixBorderLeftIcon,
  BorderRightIcon as RadixBorderRightIcon,
  ChevronDownIcon as RadixChevronDownIcon,
  Cross2Icon as RadixCross2Icon,
  DotsHorizontalIcon as RadixDotsHorizontalIcon,
  EnterFullScreenIcon as RadixEnterFullScreenIcon,
  ExitFullScreenIcon as RadixExitFullScreenIcon,
  LayersIcon as RadixLayersIcon,
  MagnifyingGlassIcon as RadixMagnifyingGlassIcon,
  MinusIcon as RadixMinusIcon,
  MoonIcon as RadixMoonIcon,
  Pencil1Icon as RadixPencil1Icon,
  PlusIcon as RadixPlusIcon,
  ReloadIcon as RadixReloadIcon,
  ResetIcon as RadixResetIcon,
  ResumeIcon as RadixResumeIcon,
  SewingPinIcon as RadixSewingPinIcon,
  Share1Icon as RadixShare1Icon,
  Share2Icon as RadixShare2Icon,
  SizeIcon as RadixSizeIcon,
  SunIcon as RadixSunIcon,
  TrashIcon as RadixTrashIcon,
} from '@radix-ui/react-icons';
import type { ComponentProps } from 'react';

type RadixIcon = typeof RadixPlusIcon;
type IconProps = ComponentProps<RadixIcon>;

function createIcon(Glyph: RadixIcon) {
  return function KestrelUiIcon({ className = '', ...props }: IconProps) {
    return <Glyph {...props} aria-hidden="true" className={`ui-icon ${className}`.trim()} />;
  };
}

export const ArrowDownIcon = createIcon(RadixArrowDownIcon);
export const ArrowRightIcon = createIcon(RadixArrowRightIcon);
export const ArrowUpIcon = createIcon(RadixArrowUpIcon);
export const BorderLeftIcon = createIcon(RadixBorderLeftIcon);
export const BorderRightIcon = createIcon(RadixBorderRightIcon);
export const ChevronDownIcon = createIcon(RadixChevronDownIcon);
export const Cross2Icon = createIcon(RadixCross2Icon);
export const DotsHorizontalIcon = createIcon(RadixDotsHorizontalIcon);
export const EnterFullScreenIcon = createIcon(RadixEnterFullScreenIcon);
export const ExitFullScreenIcon = createIcon(RadixExitFullScreenIcon);
export const LayersIcon = createIcon(RadixLayersIcon);
export const MagnifyingGlassIcon = createIcon(RadixMagnifyingGlassIcon);
export const MinusIcon = createIcon(RadixMinusIcon);
export const MoonIcon = createIcon(RadixMoonIcon);
export const Pencil1Icon = createIcon(RadixPencil1Icon);
export const PlusIcon = createIcon(RadixPlusIcon);
export const ReloadIcon = createIcon(RadixReloadIcon);
export const ResetIcon = createIcon(RadixResetIcon);
export const ResumeIcon = createIcon(RadixResumeIcon);
export const SewingPinIcon = createIcon(RadixSewingPinIcon);
export const Share1Icon = createIcon(RadixShare1Icon);
export const Share2Icon = createIcon(RadixShare2Icon);
export const SizeIcon = createIcon(RadixSizeIcon);
export const SunIcon = createIcon(RadixSunIcon);
export const TrashIcon = createIcon(RadixTrashIcon);
