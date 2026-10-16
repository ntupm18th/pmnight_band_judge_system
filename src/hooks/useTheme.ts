import { useCallback, useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'pm.theme';

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // ignore
  }
  return 'system';
}

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function initTheme() {
  apply(readPref());
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(readPref);

  useEffect(() => {
    apply(pref);
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const cycle = useCallback(() => {
    setPref((p) => {
      const next: ThemePref = p === 'system' ? 'light' : p === 'light' ? 'dark' : 'system';
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return { pref, cycle };
}
