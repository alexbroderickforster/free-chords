// Offline / installability helpers. FreeChords is already offline-capable — the
// songbook lives in localStorage and the app shell is precached by the service
// worker — so this is mostly about making that visible and keeping the screen
// awake while a set auto-scrolls.

// Is the app running as an installed PWA (home-screen / standalone window)?
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  const mm = window.matchMedia && window.matchMedia('(display-mode: standalone)');
  return (mm && mm.matches) || window.navigator.standalone === true;
}

export function supportsWakeLock() {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

// Rough platform check so we can show the right "install" hint (iOS has no
// beforeinstallprompt — the user adds to home screen via the Share sheet).
export function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as Mac
}
