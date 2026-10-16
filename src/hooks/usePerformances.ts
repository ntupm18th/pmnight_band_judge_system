import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { errorMessage } from '../lib/errors';
import { getDb } from '../lib/firebase';
import type { Performance } from '../lib/types';

export function sortPerformances(list: Performance[]): Performance[] {
  return [...list].sort((a, b) => a.day - b.day || a.order - b.order || a.bandName.localeCompare(b.bandName));
}

/** 所有表演（含停用；已刪除者除非 includeDeleted 否則排除），依日期與順序排序 */
export function usePerformances(includeDeleted = false) {
  const [performances, setPerformances] = useState<Performance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () =>
      onSnapshot(
        collection(getDb(), 'performances'),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, startTime: '', ...d.data() }) as Performance);
          setPerformances(sortPerformances(includeDeleted ? list : list.filter((p) => !p.deleted)));
          setError(null);
        },
        (e) => setError(errorMessage(e)),
      ),
    [includeDeleted],
  );
  return { performances, error };
}
