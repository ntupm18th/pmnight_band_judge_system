import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { getDb } from '../lib/firebase';
import type { Settings } from '../lib/types';

export function useSettings(enabled: boolean): Settings {
  const [settings, setSettings] = useState<Settings>({ scoringLocked: false });
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(getDb(), 'config/settings'),
      (snap) => setSettings({ scoringLocked: snap.data()?.scoringLocked === true }),
      (err) => console.error('[settings]', err),
    );
  }, [enabled]);
  return settings;
}
