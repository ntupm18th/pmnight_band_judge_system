import { collection, getDocs, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { contentOf, type ScoreContent } from '../hooks/useMyScores';
import { errorMessage } from '../lib/errors';
import { getDb } from '../lib/firebase';
import { CATEGORY_LABEL, RUBRICS, isComplete, rubricItems, totalOf } from '../lib/rubric';
import type { Score } from '../lib/types';
import { adminEditScore } from './adminEdit';
import { useAdminData } from './AdminData';

interface AuditRow {
  id: string;
  actorUid: string;
  reason: string;
  at: Date | null;
  before: ScoreContent;
  after: ScoreContent;
}

export function ScoreEditDialog({ score: initialScore, onClose }: { score: Score; onClose: () => void }) {
  const { profile } = useAuth();
  const { scores, performances, usersById } = useAdminData();
  // 對話框開著時評審可能又改了，永遠以最新資料為準
  const score = scores?.find((s) => s.id === initialScore.id) ?? initialScore;
  const perf = performances?.find((p) => p.id === score.performanceId);
  const [draft, setDraft] = useState<ScoreContent>(() => contentOf(score));
  const [baseRev, setBaseRev] = useState(score.rev);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AuditRow[] | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const name = (uid: string) => usersById.get(uid)?.displayName ?? uid.slice(0, 6);

  useEffect(() => {
    getDocs(query(collection(getDb(), 'auditLogs'), where('scoreId', '==', score.id)))
      .then((snap) =>
        setHistory(
          snap.docs
            .map((d) => {
              const a = d.data();
              return { id: d.id, actorUid: a.actorUid, reason: a.reason, at: a.at?.toDate?.() ?? null, before: a.before, after: a.after };
            })
            .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0)),
        ),
      )
      .catch(() => setHistory([]));
  }, [score.id, score.rev]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const items = rubricItems(score.category);
  const changedRemotely = score.rev !== baseRev;
  const changes = useMemo(() => {
    const orig = contentOf(score);
    const list: string[] = [];
    for (const i of items) if (orig.items[i.key] !== draft.items[i.key]) list.push(`${i.label}：${orig.items[i.key] ?? '未填'} → ${draft.items[i.key] ?? '未填'}`);
    if (orig.status !== draft.status) list.push(`狀態：${orig.status === 'submitted' ? '完成' : '草稿'} → ${draft.status === 'submitted' ? '完成' : '草稿'}`);
    if (orig.noShow !== draft.noShow) list.push(`不上場：${orig.noShow ? '是' : '否'} → ${draft.noShow ? '是' : '否'}`);
    if (orig.note !== draft.note) list.push('備註已修改');
    return list;
  }, [score, draft, items]);

  const itemErrors = items.filter((i) => {
    const v = draft.items[i.key];
    return v !== null && (!Number.isInteger(v) || v < 0 || v > i.max);
  });
  const needComplete = draft.status === 'submitted' && !isComplete(score.category, draft.items);
  const canSave = changes.length > 0 && reason.trim().length >= 2 && itemErrors.length === 0 && !needComplete && !changedRemotely && !busy;

  function setItem(key: string, raw: string) {
    setDraft((d) => ({ ...d, items: { ...d.items, [key]: raw === '' ? null : Number(raw) } }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await adminEditScore(profile!.uid, score, draft, reason);
      onClose();
    } catch (err) {
      setError(
        (err as { code?: string }).code === 'permission-denied'
          ? '儲存被拒絕：評審可能剛好也在修改這份評分，請重新載入最新資料後再試。'
          : errorMessage(err),
      );
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="edit-title" className="card my-8 w-full max-w-lg p-5">
        <h2 id="edit-title" className="text-lg font-semibold">修改評分</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {perf ? `第 ${perf.day} 天 #${perf.order} ${perf.bandName}` : score.performanceId}・{CATEGORY_LABEL[score.category]}・評審：{name(score.judgeUid)}
        </p>

        {changedRemotely && (
          <div role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            這份評分剛剛被修改過。
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => {
                setDraft(contentOf(score));
                setBaseRev(score.rev);
              }}
            >
              載入最新資料
            </button>
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          {RUBRICS[score.category].sections.map((sec) => (
            <fieldset key={sec.title ?? 'main'}>
              {sec.title && <legend className="mb-1 text-xs font-semibold tracking-wider text-zinc-500 uppercase">{sec.title}</legend>}
              <div className="grid grid-cols-3 gap-2">
                {sec.items.map((i) => (
                  <label key={i.key} className="text-sm">
                    <span className="mb-1 block text-zinc-600 dark:text-zinc-400">
                      {i.label.split(' ')[0]} <span className="text-zinc-400">/{i.max}</span>
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={i.max}
                      step={1}
                      className="input num"
                      value={draft.items[i.key] ?? ''}
                      onChange={(e) => setItem(i.key, e.target.value)}
                      aria-invalid={itemErrors.includes(i)}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="text-right text-sm">
            總分 <span className="text-xl font-semibold num">{totalOf(score.category, draft.items)}</span> / 100
          </p>
          {itemErrors.length > 0 && <p className="text-sm text-red-600">分數必須是 0 到滿分之間的整數</p>}

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              狀態
              <select className="input w-auto" value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as ScoreContent['status'] }))}>
                <option value="draft">草稿</option>
                <option value="submitted">完成</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4" checked={draft.noShow} onChange={(e) => setDraft((d) => ({ ...d, noShow: e.target.checked }))} />
              不上場
            </label>
          </div>
          {needComplete && <p className="text-sm text-red-600">狀態為「完成」時，每個項目都必須填寫</p>}

          <label className="block text-sm">
            <span className="label">評審備註</span>
            <textarea className="input min-h-16 py-2" maxLength={2000} value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
          </label>

          <label className="block text-sm">
            <span className="label">修改原因（必填，會記錄在稽核紀錄）</span>
            <input className="input" maxLength={500} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：評審口頭告知誤觸，更正音準分數" />
          </label>

          {changes.length > 0 && (
            <ul className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {changes.map((c) => <li key={c}>• {c}</li>)}
            </ul>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>取消</button>
            <button type="submit" className="btn-primary" disabled={!canSave}>{busy ? '儲存中…' : '儲存修改'}</button>
          </div>
        </form>

        <section className="mt-5 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <h3 className="text-sm font-semibold">修改歷史</h3>
          {history === null ? (
            <p className="text-xs text-zinc-500">載入中…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-zinc-500">沒有管理員修改紀錄</p>
          ) : (
            <ul className="mt-1 space-y-1.5 text-xs">
              {history.map((h) => (
                <li key={h.id}>
                  <span className="text-zinc-500">{h.at?.toLocaleString('zh-TW', { hour12: false }) ?? '…'}</span> {name(h.actorUid)}：{h.reason}
                  <span className="block text-zinc-500">
                    總分 {totalOf(score.category, h.before.items)} → {totalOf(score.category, h.after.items)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
