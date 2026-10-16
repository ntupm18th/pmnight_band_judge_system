import { collection, onSnapshot } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { usePerformances } from '../hooks/usePerformances';
import { errorMessage } from '../lib/errors';
import { getDb } from '../lib/firebase';
import { computeStats, type PerformanceStats } from '../lib/stats';
import type { Performance, Score, UserProfile } from '../lib/types';

interface Notice {
  id: string;
  text: string;
  at: number;
}

interface AdminDataState {
  /** 含停用、不含已刪除 */
  performances: Performance[] | null;
  /** 含已刪除（表演管理用） */
  allPerformances: Performance[] | null;
  scores: Score[] | null;
  users: UserProfile[] | null;
  usersById: Map<string, UserProfile>;
  stats: Map<string, PerformanceStats>;
  error: string | null;
  notices: Notice[];
  dismissNotice: (id: string) => void;
}

const Ctx = createContext<AdminDataState | null>(null);

export function AdminDataProvider({ children }: { children?: ReactNode }) {
  const { performances: allPerformances, error: perfError } = usePerformances(true);
  const [scores, setScores] = useState<Score[] | null>(null);
  const [users, setUsers] = useState<UserProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const prevNoShow = useRef<Map<string, boolean> | null>(null);

  useEffect(
    () =>
      onSnapshot(
        collection(getDb(), 'scores'),
        (snap) => setScores(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Score)),
        (e) => setError(errorMessage(e)),
      ),
    [],
  );

  useEffect(
    () =>
      onSnapshot(
        collection(getDb(), 'users'),
        (snap) => {
          const list = snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile);
          list.sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.username.localeCompare(b.username));
          setUsers(list);
        },
        (e) => setError(errorMessage(e)),
      ),
    [],
  );

  const performances = useMemo(() => allPerformances?.filter((p) => !p.deleted) ?? null, [allPerformances]);
  const usersById = useMemo(() => new Map((users ?? []).map((u) => [u.uid, u])), [users]);
  const stats = useMemo(() => computeStats(performances ?? [], scores ?? []), [performances, scores]);

  // 不上場即時通知：只在載入後狀態改變時通知
  useEffect(() => {
    if (!scores || !performances) return;
    const now = new Map(scores.map((s) => [s.id, s.noShow]));
    const prev = prevNoShow.current;
    prevNoShow.current = now;
    if (!prev) return;
    const perfById = new Map(performances.map((p) => [p.id, p]));
    const fresh: Notice[] = [];
    for (const s of scores) {
      const was = prev.get(s.id) ?? false;
      if (was === s.noShow) continue;
      const p = perfById.get(s.performanceId);
      const judge = usersById.get(s.judgeUid)?.displayName ?? '評審';
      const what = p ? `第 ${p.day} 天 #${p.order} ${p.bandName}` : '某組表演';
      fresh.push({
        id: `${s.id}-${Date.now()}`,
        text: s.noShow ? `${judge} 將 ${what} 標記為不上場` : `${judge} 取消了 ${what} 的不上場標記`,
        at: Date.now(),
      });
    }
    if (fresh.length) setNotices((n) => [...fresh, ...n].slice(0, 5));
  }, [scores, performances, usersById]);

  const value: AdminDataState = {
    performances,
    allPerformances,
    scores,
    users,
    usersById,
    stats,
    error: error ?? perfError,
    notices,
    dismissNotice: (id) => setNotices((n) => n.filter((x) => x.id !== id)),
  };

  return (
    <Ctx.Provider value={value}>
      {children ?? <Outlet />}
      {notices.length > 0 && (
        <div className="fixed right-4 bottom-4 z-40 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
          {notices.map((n) => (
            <div key={n.id} className="card flex items-start gap-2 border-amber-300 p-3 text-sm shadow-lg dark:border-amber-700">
              <span className="flex-1">{n.text}</span>
              <button className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => value.dismissNotice(n.id)} aria-label="關閉通知">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useAdminData(): AdminDataState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAdminData must be used within AdminDataProvider');
  return v;
}
