import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useAdminData } from '../../admin/AdminData';
import type { ScoreContent } from '../../hooks/useMyScores';
import { errorMessage } from '../../lib/errors';
import { getDb } from '../../lib/firebase';
import { rubricItems, totalOf } from '../../lib/rubric';
import type { Category } from '../../lib/types';

interface AuditLog {
  id: string;
  actorUid: string;
  scoreId: string;
  judgeUid: string;
  performanceId: string;
  before: ScoreContent;
  after: ScoreContent;
  reason: string;
  at: Date | null;
}

function diff(category: Category, a: ScoreContent, b: ScoreContent): string[] {
  const out: string[] = [];
  for (const i of rubricItems(category)) {
    if (a.items[i.key] !== b.items[i.key]) out.push(`${i.label.split(' ')[0]} ${a.items[i.key] ?? '未填'}→${b.items[i.key] ?? '未填'}`);
  }
  if (a.status !== b.status) out.push(`狀態 ${a.status === 'submitted' ? '完成' : '草稿'}→${b.status === 'submitted' ? '完成' : '草稿'}`);
  if (a.noShow !== b.noShow) out.push(`不上場 ${a.noShow ? '是' : '否'}→${b.noShow ? '是' : '否'}`);
  if (a.note !== b.note) out.push(`備註「${a.note || '（空）'}」→「${b.note || '（空）'}」`);
  return out;
}

export function AuditPage() {
  const { performances, usersById } = useAdminData();
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      onSnapshot(
        query(collection(getDb(), 'auditLogs'), orderBy('at', 'desc'), limit(500)),
        (snap) =>
          setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data(), at: d.data().at?.toDate?.() ?? null }) as AuditLog)),
        (e) => setError(errorMessage(e)),
      ),
    [],
  );

  const name = (uid: string) => usersById.get(uid)?.displayName ?? uid.slice(0, 6);
  const perfById = new Map((performances ?? []).map((p) => [p.id, p]));

  if (error) return <p role="alert" className="text-red-600">{error}</p>;
  if (!logs) return <p className="text-zinc-500">載入中…</p>;

  return (
    <section className="card overflow-x-auto">
      <h2 className="border-b border-zinc-200 px-4 py-3 font-semibold dark:border-zinc-800">
        管理員修改紀錄 <span className="text-sm font-normal text-zinc-500">（{logs.length} 筆，紀錄無法修改或刪除）</span>
      </h2>
      {logs.length === 0 ? (
        <p className="p-4 text-sm text-zinc-500">目前沒有任何管理員修改評分的紀錄。</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            <tr>
              <th className="px-3 py-2 font-medium">時間</th>
              <th className="px-3 py-2 font-medium">操作者</th>
              <th className="px-3 py-2 font-medium">表演</th>
              <th className="px-3 py-2 font-medium">被修改的評審</th>
              <th className="px-3 py-2 font-medium">修改內容</th>
              <th className="px-3 py-2 font-medium">原因</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => {
              const p = perfById.get(l.performanceId);
              const cat = (p?.category ?? (Object.keys(l.before.items).length === 3 ? 'vocal' : 'band')) as Category;
              return (
                <tr key={l.id} className="border-t border-zinc-100 align-top dark:border-zinc-800">
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-500">{l.at?.toLocaleString('zh-TW', { hour12: false }) ?? '…'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{name(l.actorUid)}</td>
                  <td className="px-3 py-2">{p ? `第 ${p.day} 天 #${p.order} ${p.bandName}` : '（已刪除的表演）'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{name(l.judgeUid)}</td>
                  <td className="px-3 py-2">
                    <span className="tabular-nums">總分 {totalOf(cat, l.before.items)} → {totalOf(cat, l.after.items)}</span>
                    <span className="block text-xs text-zinc-500">{diff(cat, l.before, l.after).join('；')}</span>
                  </td>
                  <td className="px-3 py-2">{l.reason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
