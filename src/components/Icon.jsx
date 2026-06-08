// Icon — a thin wrapper over lucide-react that keeps the design system's
// terse `<Icon n="star" s={18} />` call signature. Strokes inherit
// currentColor, so icons pick up --ink / --accent from context.
import {
  Library, AudioLines, Sun, Moon, Check, ArrowLeft, Star, X, Plus, Music,
  AArrowDown, AArrowUp, SlidersHorizontal, Minimize2, Maximize2, RotateCcw,
  Play, Pause, Search, Clipboard, Wand2, Mic,
} from 'lucide-react';

const ICONS = {
  'library': Library,
  'audio-lines': AudioLines,
  'sun': Sun,
  'moon': Moon,
  'check': Check,
  'arrow-left': ArrowLeft,
  'star': Star,
  'x': X,
  'plus': Plus,
  'music': Music,
  'a-arrow-down': AArrowDown,
  'a-arrow-up': AArrowUp,
  'sliders-horizontal': SlidersHorizontal,
  'minimize-2': Minimize2,
  'maximize-2': Maximize2,
  'rotate-ccw': RotateCcw,
  'play': Play,
  'pause': Pause,
  'search': Search,
  'clipboard': Clipboard,
  'wand-2': Wand2,
  'mic': Mic,
};

export function Icon({ n, s = 20, cls, ...rest }) {
  const Cmp = ICONS[n];
  if (!Cmp) return null;
  return <Cmp size={s} strokeWidth={1.75} className={cls} {...rest} />;
}
