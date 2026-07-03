// Icon — a thin wrapper over lucide-react that keeps the design system's
// terse `<Icon n="star" s={18} />` call signature. Strokes inherit
// currentColor, so icons pick up --ink / --accent from context.
import {
  Library, AudioLines, Sun, Moon, Check, ArrowLeft, Star, X, Plus, Music,
  AArrowDown, AArrowUp, SlidersHorizontal, Minimize2, Maximize2, RotateCcw,
  Play, Pause, Search, Clipboard, Wand2, Mic, Download, Upload, Pencil, Trash2, CircleAlert,
  ListMusic, SkipBack, SkipForward, ChevronUp, ChevronDown, Ear,
  Image as ImageIcon, KeyRound, Printer, FileDown, WifiOff, Settings as SettingsIcon,
  Repeat, Share2, Bookmark, Turtle, Rabbit, Clock, GraduationCap, Circle, Square,
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
  'download': Download,
  'upload': Upload,
  'pencil': Pencil,
  'trash-2': Trash2,
  'circle-alert': CircleAlert,
  'list-music': ListMusic,
  'skip-back': SkipBack,
  'skip-forward': SkipForward,
  'chevron-up': ChevronUp,
  'chevron-down': ChevronDown,
  'ear': Ear,
  'image': ImageIcon,
  'key-round': KeyRound,
  'printer': Printer,
  'file-down': FileDown,
  'wifi-off': WifiOff,
  'settings': SettingsIcon,
  'repeat': Repeat,
  'share-2': Share2,
  'bookmark': Bookmark,
  'turtle': Turtle,
  'rabbit': Rabbit,
  'clock': Clock,
  'graduation-cap': GraduationCap,
  'circle': Circle,
  'square': Square,
};

export function Icon({ n, s = 20, cls, ...rest }) {
  // Metronome isn't in lucide — hand-drawn to match the 24px stroke style.
  if (n === 'metronome') {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={cls} {...rest}>
        <path d="M9 3h6l4 18H5z" />
        <line x1="12" y1="21" x2="15.5" y2="7" />
        <circle cx="15.5" cy="7" r="1.3" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  const Cmp = ICONS[n];
  if (!Cmp) return null;
  return <Cmp size={s} strokeWidth={1.75} className={cls} {...rest} />;
}
