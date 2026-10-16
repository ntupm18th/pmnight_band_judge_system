import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deviceId } from '../lib/device';
import { getDb } from '../lib/firebase';
import { emptyItems } from '../lib/rubric';
import type { Items, Performance, Score, ScoreStatus } from '../lib/types';

/** 評審可編輯的內容 */
export interface ScoreContent {
  items: Items;
  status: ScoreStatus;
  noShow: boolean;
  note: string;
}

/**
 * 本機變更日誌：每次儲存先記在 localStorage，伺服器確認後才移除。
 * 這樣即使離線時關掉頁面、或寫入在重新連線後被伺服器拒絕（鎖定、版本衝突），
 * 也能明確顯示「同步失敗」並讓評審決定要重新送出或放棄，而不是默默消失。
 */
interface JournalEntry {
  performanceId: string;
  rev: number;
  data: ScoreContent;
  at: number;
  error?: string;
}
type Journal = Record<string, JournalEntry>;

export type SyncState = 'none' | 'saved' | 'syncing' | 'offline' | 'failed';

const journalKey = (uid: string) => `pm.journal.${uid}`;

function loadJournal(uid: string): Journal {
  try {
    return JSON.parse(localStorage.getItem(journalKey(uid)) ?? '{}') as Journal;
  } catch {
    return {};
  }
}

function storeJournal(uid: string, j: Journal) {
  try {
    if (Object.keys(j).length) localStorage.setItem(journalKey(uid), JSON.stringify(j));
    else localStorage.removeItem(journalKey(uid));
  } catch {
    // 無法寫入時只是少了跨重新整理的保護，寫入本身仍會進行
  }
}

export function clearJournal(uid: string) {
  try {
    localStorage.removeItem(journalKey(uid));
  } catch {
    // ignore
  }
}

function sameContent(a: ScoreContent, b: ScoreContent): boolean {
  return (
    a.status === b.status &&
    a.noShow === b.noShow &&
    a.note === b.note &&
    JSON.stringify(Object.entries(a.items).sort()) === JSON.stringify(Object.entries(b.items).sort())
  );
}

export function contentOf(s: Score): ScoreContent {
  return { items: s.items, status: s.status, noShow: s.noShow, note: s.note };
}

export const scoreIdOf = (performanceId: string, uid: string) => `${performanceId}_${uid}`;

export function useMyScores(uid: string, online: boolean, locked: boolean) {
  const [scores, setScores] = useState<Map<string, Score>>(new Map());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [fromCache, setFromCache] = useState(true);
  const [journal, setJournal] = useState<Journal>(() => loadJournal(uid));
  const revRef = useRef(new Map<string, number>());
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const updateJournal = useCallback(
    (fn: (j: Journal) => Journal) => {
      setJournal((prev) => {
        const next = fn(prev);
        storeJournal(uid, next);
        return next;
      });
    },
    [uid],
  );

  useEffect(() => {
    const q = query(collection(getDb(), 'scores'), where('judgeUid', '==', uid));
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        const map = new Map<string, Score>();
        const pend = new Set<string>();
        snap.docs.forEach((d) => {
          map.set(d.get('performanceId'), { id: d.id, ...d.data() } as Score);
          if (d.metadata.hasPendingWrites) pend.add(d.id);
        });
        setScores(map);
        setPending(pend);
        setFromCache(snap.metadata.fromCache);
        setLoaded(true);
      },
      (e) => console.error('[scores]', e),
    );
  }, [uid]);

  // 以伺服器確認過的資料核對日誌
  useEffect(() => {
    if (fromCache) return;
    updateJournal((j) => {
      let changed = false;
      const next: Journal = { ...j };
      for (const [id, entry] of Object.entries(j)) {
        if (pending.has(id) || entry.error) continue;
        const server = scores.get(entry.performanceId);
        if (server && server.rev >= entry.rev && sameContent(contentOf(server), entry.data)) {
          delete next[id];
          changed = true;
        } else if (Date.now() - entry.at > 5000) {
          // 剛送出的寫入可能還沒出現在快照裡；正在進行中的拒絕由 save() 的 catch 處理
          next[id] = {
            ...entry,
            error: lockedRef.current
              ? '評分已鎖定，這次修改沒有送出'
              : '伺服器上的版本不同（可能已在其他裝置修改），這次修改沒有送出',
          };
          changed = true;
        }
      }
      return changed ? next : j;
    });
  }, [scores, pending, fromCache, updateJournal]);

  const save = useCallback(
    (perf: Performance, patch: Partial<ScoreContent>, baseOverride?: ScoreContent) => {
      const id = scoreIdOf(perf.id, uid);
      const cur = scores.get(perf.id);
      const base: ScoreContent = baseOverride ??
        (cur ? contentOf(cur) : { items: emptyItems(perf.category), status: 'draft', noShow: false, note: '' });
      const data: ScoreContent = { ...base, ...patch };
      const rev = Math.max(cur?.rev ?? 0, revRef.current.get(id) ?? 0) + 1;
      revRef.current.set(id, rev);
      updateJournal((j) => ({ ...j, [id]: { performanceId: perf.id, rev, data, at: Date.now() } }));

      setDoc(doc(getDb(), 'scores', id), {
        performanceId: perf.id,
        judgeUid: uid,
        category: cur?.category ?? perf.category,
        ...data,
        rev,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        deviceId: deviceId(),
        lastAuditId: null,
      }).catch((e: { code?: string }) => {
        revRef.current.delete(id);
        const msg =
          e.code === 'permission-denied'
            ? lockedRef.current
              ? '評分已鎖定，這次修改沒有送出'
              : '伺服器拒絕這次修改（可能已在其他裝置修改），請確認後重新送出'
            : `儲存失敗：${e.code ?? '未知錯誤'}`;
        updateJournal((j) => (j[id] && j[id].rev === rev ? { ...j, [id]: { ...j[id], error: msg } } : j));
      });
      return data;
    },
    [scores, uid, updateJournal],
  );

  /** 以本機版本覆蓋伺服器版本 */
  const retry = useCallback(
    (perf: Performance) => {
      const entry = journal[scoreIdOf(perf.id, uid)];
      if (entry) save(perf, {}, entry.data);
    },
    [journal, save, uid],
  );

  const discard = useCallback(
    (perf: Performance) => {
      const id = scoreIdOf(perf.id, uid);
      updateJournal((j) => {
        const next = { ...j };
        delete next[id];
        return next;
      });
    },
    [uid, updateJournal],
  );

  const syncStateOf = useCallback(
    (performanceId: string): SyncState => {
      const id = scoreIdOf(performanceId, uid);
      const entry = journal[id];
      if (entry?.error) return 'failed';
      if (pending.has(id) || entry) return online ? 'syncing' : 'offline';
      return scores.has(performanceId) ? 'saved' : 'none';
    },
    [journal, pending, scores, online, uid],
  );

  const failures = useMemo(
    () => Object.entries(journal).filter(([, e]) => e.error).map(([id, e]) => ({ id, ...e })),
    [journal],
  );
  const unsyncedCount = useMemo(
    () => new Set([...pending, ...Object.keys(journal)]).size,
    [pending, journal],
  );

  return { scores, loaded, save, retry, discard, syncStateOf, journal, failures, unsyncedCount };
}
