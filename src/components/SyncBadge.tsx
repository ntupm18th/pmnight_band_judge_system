import type { SyncState } from '../hooks/useMyScores';

const STYLES: Record<SyncState, { text: string; cls: string }> = {
  none: { text: '尚未評分', cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300' },
  saved: { text: '✓ 已儲存', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200' },
  syncing: { text: '同步中…', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200' },
  offline: { text: '離線：僅存在此裝置，尚未同步', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200' },
  failed: { text: '✕ 同步失敗', cls: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200' },
};

export function SyncBadge({ state }: { state: SyncState }) {
  const s = STYLES[state];
  return (
    <span role="status" aria-live="polite" className={`badge ${s.cls}`}>
      {s.text}
    </span>
  );
}

/** 清單中的小圓點 */
export function SyncDot({ state }: { state: SyncState }) {
  if (state === 'saved' || state === 'none') return null;
  const color = state === 'failed' ? 'bg-red-500' : state === 'offline' ? 'bg-amber-500' : 'bg-sky-500';
  const label = STYLES[state].text;
  return <span className={`inline-block size-2 rounded-full ${color}`} title={label} aria-label={label} />;
}
